package engine

import (
	"compress/gzip"
	"crypto/sha256"
	"encoding/base64"
	"encoding/gob"
	"encoding/json"
	"errors"
	"hash/fnv"
	"io/ioutil"
	"os"
	"os/exec"
	"strings"
	"sync"
	"unicode"

	"github.com/DataDog/hyperloglog"
	"github.com/robertkrimen/otto"
	"github.com/robertkrimen/otto/registry"
	_ "github.com/robertkrimen/otto/underscore"
	"golang.org/x/exp/slices"
)

//go:embed utils.js
var utils string

var entryForUtils *registry.Entry = registry.Register(func() string { return utils })

type Target struct {
	Name    string
	Content []byte
	Done    chan bool
	VM      *otto.Otto
}

func DependOn(m map[string]*Target, t_ string, h chan string, in string) *Target {
	var t string
	if strings.HasPrefix(t_, "@") {
		t = strings.TrimPrefix(t_, "@")
	} else {
		s := strings.Split(in, "//")
		t = strings.Join(s[:len(s)-2], "//") + ":" + strings.TrimPrefix(t_, "//")
	}
	go func() {
		h <- t
	}()
	var tt *Target
	for {
		if m[t] != nil {
			tt = m[t]
			goto l1
		}
	}
l1:
	x := <-tt.Done
	go func() {
		tt.Done <- x
	}()
	return tt
}

func HashSlice(sl []string, sum []byte) []byte {
	s := sha256.New()
	sl2 := slices.Clone(sl)
	slices.Sort(sl2)
	for _, s2 := range sl2 {
		s.Write([]byte(s2))
	}
	return s.Sum(sum)
}

func HashFnv(s string) uint32 {
	h := fnv.New32a()
	h.Write([]byte(s))
	return h.Sum32()
}

type Cache struct {
	Local       map[string]map[string][]byte
	FileFolder  *string
	Lock        sync.Mutex
	ActionHits  *hyperloglog.HyperLogLog
	ActionTotal *hyperloglog.HyperLogLog
	Hits        *hyperloglog.HyperLogLog
	Total       *hyperloglog.HyperLogLog
}

func (c *Cache) Activate(hs string) {
	if c.Local[hs] != nil {
		return
	}
	if c.FileFolder != nil {
		var t map[string][]byte
		f, err := os.Open(*c.FileFolder + "/" + hs)
		if err == nil {
			defer f.Close()
			g, _ := gzip.NewReader(f)
			if json.NewDecoder(g).Decode(t) == nil {
				c.Local[hs] = t
				return
			}
		}
	}
}

func (c *Cache) Get(hs, k string) ([]byte, bool) {
	c.Lock.Lock()
	defer c.Lock.Unlock()
	c.Activate(hs)
	a, b := c.Local[hs][k]
	return a, b
}

func (c *Cache) Sync() {
	c.Lock.Lock()
	defer c.Lock.Unlock()
	h := make(chan bool)
	toSync := 0
	for k, l := range c.Local {
		if _, err := os.Stat(*c.FileFolder + "/" + k); errors.Is(err, os.ErrNotExist) {
			toSync += 1
			go func() {
				defer func() { h <- true }()
				f, _ := os.Create(*c.FileFolder + "/" + k)
				defer f.Close()
				json.NewEncoder(gzip.NewWriter(f)).Encode(l)
			}()
		}
	}

	for i := 0; i < toSync; i++ {
		<-h
	}
}

func SafeDiv[T float32 | float64](a, b T) T {
	if a == b {
		return 1
	}
	if b == 0 {
		return -1
	}
	return a / b
}

func (c *Cache) Incrementality() float64 {
	a := SafeDiv(float64(c.ActionHits.Count()), float64(c.ActionTotal.Count()))
	b := SafeDiv(float64(c.Hits.Count()), float64(c.Total.Count()))
	if a == -1 || b == -1 {
		return -1
	}
	return (a + b) / 2
}

func IsMostlyInCharset(s string, c *unicode.RangeTable) bool {
	r := []rune(s)
	x := 0
	for _, l := range r {
		if unicode.In(l, c) {
			x++
		}
	}
	return x > len(r)/2
}

func SetupVM(v *otto.Otto, m map[string]*Target, b string, h chan string, cache *Cache, proc chan bool, idx chan *string, cfg []string) {

	v.Set("dependOn", func(call otto.FunctionCall) otto.Value {
		rx := make([][]byte, len(call.ArgumentList))
		c := make(chan bool)
		for i, a := range call.ArgumentList {
			i := i
			a := a
			go func() {
				s, _ := a.ToString()
				if strings.HasPrefix(s, ":") {
					s = InjectTarget(b, s)
				}
				u := DependOn(m, s, h, b).Content
				rx[i] = u
				c <- true
			}()
		}
		for range call.ArgumentList {
			<-c
		}
		r, _ := v.ToValue(rx)
		return r
	})
	v.Set("dependOnS", func(call otto.FunctionCall) otto.Value {
		rx := make([]string, len(call.ArgumentList))
		c := make(chan bool)
		for i, a := range call.ArgumentList {
			i := i
			a := a
			go func() {
				s, _ := a.ToString()
				if strings.HasPrefix(s, ":") {
					s = InjectTarget(b, s)
				}
				u := DependOn(m, s, h, b).Content
				rx[i] = string(u)
				c <- true
			}()
		}
		for range call.ArgumentList {
			<-c
		}
		r, _ := v.ToValue(rx)
		return r
	})
	v.Set("exec", func(call otto.FunctionCall) otto.Value {
		h := sha256.New()
		gob.NewEncoder(h).Encode(call)
		h.Write(HashSlice(cfg, []byte("dream!cfg")))
		hs := base64.StdEncoding.EncodeToString(h.Sum([]byte("dream!action")))
		p := make(map[string][]byte)
		defer func() {
			cache.Lock.Lock()
			defer cache.Lock.Unlock()
			cache.Local[hs] = p
		}()
		cache.Lock.Lock()
		cache.ActionTotal.Add(HashFnv(hs))
		if cache.Local[hs] != nil {
			p = cache.Local[hs]
			cache.ActionHits.Add(HashFnv(hs))
			cache.Lock.Unlock()
		} else {
			cache.Lock.Unlock()
			proc <- true
			id := <-idx
			defer func() { <-proc; idx <- id }()
			//*id = fmt.Sprintf("Build %s:%s", b, hs)
			cmd, _ := call.Argument(0).ToString()
			sd, _ := os.MkdirTemp(os.TempDir(), "dream-**")
			defer os.RemoveAll(sd)
			c := exec.Command("sh", "-c", cmd)
			c.Dir = sd
			o := call.Argument(1).Object()
			for _, k := range o.Keys() {
				v, _ := o.Get(k)
				y, _ := v.Export()
				ioutil.WriteFile(sd+k, y.([]byte), 0o777)
			}
			c.Run()
			x, _ := call.Argument(1).Export()
			z := x.([]string)
			for _, w := range z {
				p[w], _ = ioutil.ReadFile(sd + w)
			}
		}
		r, _ := v.ToValue(p)
		return r
	})
	/*
		v.Set("makeGob", func(call otto.FunctionCall) otto.Value {
			x, _ := call.Argument(0).Export()
			var s bytes.Buffer
			gob.NewEncoder(bufio.NewWriter(&s)).Encode(x)
			r, _ := v.ToValue(s.Bytes())
			return r
		})
		v.Set("extractGob", func(call otto.FunctionCall) otto.Value {
			x, _ := call.Argument(0).Export()
			s := bytes.NewBuffer(x.([]byte))
			var i interface{}
			gob.NewDecoder(s).Decode(i)
			r, _ := v.ToValue(i)
			return r
		})
	*/
	v.Set("barray2string", func(call otto.FunctionCall) otto.Value {
		x, _ := call.Argument(0).Export()
		y, _ := v.ToValue(string(x.([]byte)))
		return y
	})

}
func BuildFile(x string) string {
	s := strings.Split(x, ":")
	return strings.Join(s[:len(s)-2], ":") + "/DREAM"
}
func InjectTarget(x, y string) string {
	s := strings.Split(x, "/")
	return strings.Join(s[:len(s)-2], "/") + y
}
func Build(m map[string]*Target, x string, h chan string, cache *Cache, proc chan bool, idx chan *string, cfg []string) {
	if tt, ok := m[x]; ok {
		x := <-tt.Done
		go func() {
			tt.Done <- x
		}()
		return
	}
	if strings.Contains(x, ":") {
		b := DependOn(m, BuildFile(x), h, BuildFile(BuildFile(x)))
		hash := sha256.New()
		hash.Write(b.Content)
		hash.Write(HashSlice(cfg, []byte("dream!cfg")))
		hash.Write([]byte(x))
		hs := base64.StdEncoding.EncodeToString(hash.Sum([]byte("dream!build")))
		defer func() {
			go func() {
				m[x].Done <- true
			}()
		}()
		cache.Total.Add(HashFnv(hs))
		if k, ok := cache.Get(hs, "#Main"); ok {
			m[x] = &Target{Done: make(chan bool), Name: x, Content: k}
			cache.Hits.Add(HashFnv(hs))
			return
		}
		defer func() {
			cache.Lock.Lock()
			defer cache.Lock.Unlock()
			cache.Local[hs]["#Main"] = m[x].Content
		}()
		if b.VM == nil {
			v := otto.New()
			SetupVM(v, m, b.Name, h, cache, proc, idx, cfg)
			b.VM = v
		}
		g, _ := b.VM.Get("Build")
		r, _ := g.Call(b.VM.ToValue(x))
		y, _ := r.Export()
		m[x] = &Target{Done: make(chan bool), Name: x, Content: y.([]byte)}
	} else {
		y := "./" + x[2:]
		f, _ := ioutil.ReadFile(y)
		m[x] = &Target{Done: make(chan bool), Name: x, Content: f}
	}
}

func BuildLoop(m map[string]*Target, h chan string, cache *Cache, proc chan bool, idx chan *string, cfg []string) {
	for {
		w := <-h
		go Build(m, w, h, cache, proc, idx, cfg)
	}
}
