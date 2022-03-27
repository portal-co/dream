function dependOnP() {
    return _.map(dependOn(arguments), extractGob)
}
Array.prototype.providerAt = function (x) {
    for (var v of this) if (v.id == x) return v;
    return null;
}
buildRules = []
function Build(x) {
    for (var r of buildRules) {
        var s = r(x);
        if (s) return s;
    }
    throw "Cannot build " + x
}
function ninjaLibrary(opts) {
    var ninja = opts.buildFile;
    var rules = {}
    function query(x) {
        var d = barray2string(exec("ninja -t deps " + x + ">.o", { "build.ninja": ninja })[".o"]).split('\n')
        var o = barray2string(exec("ninja -t outputs " + x + ">.o", { "build.ninja": ninja })[".o"]).split('\n')
        var c = barray2string(exec("ninja -t commands " + x + ">.o", { "build.ninja": ninja })[".o"]).split('\n')
        c = c[c.length];
        if (c.startsWith('make')) {
            var flags = c.split(' ');
            var curdir = '.', file = 'Makefile';
            for (var i in flags) {
                if (flags[i] == '-C') curdir = flags[i + 1];
                if (flags[i] == '-f') file = flags[i + 1];
                makeLibrary({
                    name: opts.name + "/" + curdir,
                    tools: opts.tools,
                    buildFile: dependOnP(':' + opts.name + "/" + file)[0].providerAt("@DefaultInfo").files[opts.name + "/" + file]
                })
            };
        } else if (c.startsWith('ninja')) {
            var flags = c.split(' ');
            var curdir = '.', file = 'build.ninja';
            for (var i in flags) {
                if (flags[i] == '-C') curdir = flags[i + 1];
                if (flags[i] == '-f') file = flags[i + 1];
                ninjaLibrary({
                    name: opts.name + "/" + curdir,
                    tools: opts.tools,
                    buildFile: dependOnP(':' + opts.name + "/" + file)[0].providerAt("@DefaultInfo").files[opts.name + "/" + file]
                })
            };
        } else {
            rules[x] = { deps: d, command: c, outs: o };
        }
        for (let d of deps) query(d);
    }
    buildRules += [function (x) {
        if (!x.startsWith(opts.name)) return;
        x = x.substr(opts.name.length);
        var y = {};
        Object.assign(y, opts.tools)
        for (var z of rules[x].deps) Object.assign(y, dependOnP(":" + opts.name + "/" + z)[0].providerAt("@DefaultInfo").files);
        var res = exec(rules[x].command, y, rules[x].outs);
        return makeGob([{ id: "@DefaultInfo", files: res }])
    }]
    query(opts.main);
}
function makeLibrary(opts) {
    ninjaLibrary({
        name: opts.name,
        tools: opts.tools,
        buildFile: exec("ckati --ninja --gen_all_rules", Object.assign({ "Makefile": opts.buildFile }, opts.tools), ["build.ninja"])["build.ninja"]
    })
}
function ccLibrary(opts) {
    buildRules += [function (x) {
        if (!x.startsWith(opts.name)) return;
        var srcs = dependOnP(opts.srcs);
        var srcFiles = {};
        for (var s of srcs) Object.assign(srcFiles, s.providerAt("@DefaultInfo").files);
        var deps = dependOnP(opts.deps), depFiles = {};
        for (var d of deps) Object.assign(depFiles, d.providerAt("@CCInfo").archive);
        if (x == opts.name) {
            var objs = dependOnP(_.map(opts.srcs, x => ":" + opts.name + "/" + x)), objFiles = {};
            for (var o of objs) Object.assign(objFiles, o.providerAt("@DefaultInfo").files);
            Object.assign(objFiles, srcFiles, depFiles);
            return makeGob([{ id: '@CCInfo', archive: exec("ar crus $(find .) > '" + opts.name + ".a'", objFiles, [opts.name + ".a"])[opts.name + ".a"]}]);
        };
        var y = x.substring(opts.name.length);
        y = y.substring(1);
        return makeGob([{id: '@DefaultInfo', files: exec("ar x ./*.a;cc " + y + " -c -o " + y + ".o" + opts.cflags,Object.assign({},srcFiles,depFiles),[y + ".o"])}])
    }]
}