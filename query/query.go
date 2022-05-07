package query

import (
	"encoding/json"
	"math"
	"sync"

	"github.com/robertkrimen/otto"
	"github.com/yourbasic/graph"
	"github.com/yourbasic/graph/build"
)

type QueryArgs struct {
	Do     func(string) []byte
	InitVM func(v *otto.Otto)
	Mut    sync.Mutex
	tgts   map[string]int
	rtgts  map[int]string
	last   int
}

func (q *QueryArgs) Lookup(t string) int {
	if v, ok := q.tgts[t]; ok {
		return v
	}
	q.Mut.Lock()
	defer q.Mut.Unlock()
	q.tgts[t] = q.last
	q.rtgts[q.last] = t
	q.last++
	return q.last - 1
}

func (q *QueryArgs) Activate(x string) {
	q.Lookup(x)
	d := q.Do(x + ".query")
	var qv Query
	json.Unmarshal(d, &qv)
	ch := make(chan bool)
	for _, d := range qv.Deps {
		d := d
		go func() {
			q.Activate(d)
			ch <- true
		}()
	}
	for range qv.Deps {
		<-ch
	}
}

func (q *QueryArgs) RLookup(x int) (string, bool) {
	a, b := q.rtgts[x]
	return a, b
}

func (q *QueryArgs) MRLookup(x int) string {
	s, ok := q.RLookup(x)
	if !ok {
		panic("should exist")
	}
	return s
}

type Query struct {
	Deps []string `json:"deps"`
}
type GKey struct {
	f int
	s int
}

func (q *QueryArgs) Query(x string) {
	v := otto.New()
	q.InitVM(v)
	gm := make(map[GKey]bool)
	g := build.Generic(math.MaxInt, func(v, w int) (val bool) {
		t, ok := q.RLookup(v)
		if !ok {
			return false
		}
		if x, ok := gm[GKey{f: v, s: w}]; ok {
			return x
		}
		defer func() {
			gm[GKey{f: v, s: w}] = val
		}()
		d := q.Do(t + ".query")
		var qv Query
		json.Unmarshal(d, &qv)
		for _, d := range qv.Deps {
			l, o := q.RLookup(w)
			if d == l && o {
				return true
			}
		}
		return false
	})
	tg := graph.Transpose(g)
	v.Set("depsOf", func(c otto.FunctionCall) otto.Value {
		arg, _ := c.Argument(0).ToString()
		q.Activate(arg)
		l := []string{}
		// Visit all edges of a graph.
		for v := 0; v < g.Order(); v++ {
			g.Visit(v, func(w int, c int64) (skip bool) {
				if v == q.Lookup(arg) {
					// Visiting edge (v, w) of cost c.
					l = append(l, q.MRLookup(w))
					return
				}
				return
			})
		}
		v2, _ := v.ToValue(l)
		return v2
	})
	v.Set("rdepsOf", func(c otto.FunctionCall) otto.Value {
		arg, _ := c.Argument(0).ToString()
		q.Activate(arg)
		l := []string{}
		// Visit all edges of a graph.
		for v := 0; v < tg.Order(); v++ {
			tg.Visit(v, func(w int, c int64) (skip bool) {
				// Visiting edge (v, w) of cost c.
				if v == q.Lookup(arg) {
					l = append(l, q.MRLookup(w))
					return
				}
				return
			})
		}
		v2, _ := v.ToValue(l)
		return v2
	})
}
