package engine

import (
	"io/ioutil"
	"os"
	"os/exec"
	"strings"

	"github.com/robertkrimen/otto"
)

type Target struct {
	Name    string
	Content []byte
	Done    chan bool
	VM      *otto.Otto
}

func DependOn(m map[string]*Target, t string, h chan string) *Target {
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

func SetupVM(v *otto.Otto, m map[string]*Target, b string, h chan string) {
	v.Set("dependOn", func(call otto.FunctionCall) otto.Value {
		s, _ := call.Argument(0).ToString()
		if strings.HasPrefix(s, ":") {
			s = InjectTarget(b, s)
		}
		u := DependOn(m, s, h).Content
		r, _ := v.ToValue(u)
		return r
	})
	v.Set("dependOnS", func(call otto.FunctionCall) otto.Value {
		s, _ := call.Argument(0).ToString()
		if strings.HasPrefix(s, ":") {
			s = InjectTarget(b, s)
		}
		u := string(DependOn(m, s, h).Content)
		r, _ := v.ToValue(u)
		return r
	})
	v.Set("exec", func(call otto.FunctionCall) otto.Value {
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
		p := make(map[string][]byte)
		x, _ := call.Argument(1).Export()
		z := x.([]string)
		for _, w := range z {
			p[w], _ = ioutil.ReadFile(sd + w)
		}
		r, _ := v.ToValue(p)
		return r
	})
}
func BuildFile(x string) string {
	s := strings.Split(x, ":")
	return strings.Join(s[:len(s)-2], ":") + "/BUILD"
}
func InjectTarget(x, y string) string {
	s := strings.Split(x, "/")
	return strings.Join(s[:len(s)-2], "/") + y
}
func Build(m map[string]*Target, x string, h chan string) {
	b := DependOn(m, BuildFile(x), h)
	if b.VM == nil {
		v := otto.New()
		SetupVM(v, m, b.Name, h)
		b.VM = v
	}
	g, _ := b.VM.Get("Build")
	r, _ := g.Call(b.VM.ToValue(x))
	y, _ := r.Export()
	m[x] = &Target{Done: make(chan bool), Name: x, Content: y.([]byte)}
	go func() {
		m[x].Done <- true
	}()
}

func BuildLoop(m map[string]*Target, h chan string) {
	for {
		w := <-h
		Build(m, w, h)
	}
}
