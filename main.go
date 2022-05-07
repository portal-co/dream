package main

import (
	"io/ioutil"
	"os"
	"runtime"

	"github.com/DataDog/hyperloglog"
	"github.com/gkgoat1/dream/engine"
	"github.com/gkgoat1/dream/query"
	"github.com/robertkrimen/otto"
)

func hll() *hyperloglog.HyperLogLog {
	x, _ := hyperloglog.New(64)
	return x
}
func main() {
	s := "./dream-cache"
	cache := &engine.Cache{
		FileFolder:  &s,
		ActionHits:  hll(),
		ActionTotal: hll(),
		Hits:        hll(),
		Total:       hll(),
	}
	tgts := make(map[string]*engine.Target)
	h := make(chan string)
	proc := make(chan bool, runtime.GOMAXPROCS(0))
	idx := make(chan *string, runtime.GOMAXPROCS(0))
	go engine.BuildLoop(tgts, h, cache, proc, idx, []string{})
	if os.Args[1] == "build" {
		t := engine.DependOn(tgts, os.Args[2], h, "//")
		ioutil.WriteFile("./dream-out", t.Content, 0777)
	} else if os.Args[1] == "query" {
		do := func(x string) []byte {
			return engine.DependOn(tgts, x, h, "//").Content
		}
		init := func(v *otto.Otto) {
			engine.SetupVM(v, tgts, "//QUERY", h, cache, proc, idx, []string{})
		}
		q := &query.QueryArgs{
			Do:     do,
			InitVM: init,
		}
		q.Query(os.Args[2])
	}
}
