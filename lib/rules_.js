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
    if (x.endsWith(".query")) {
        var q = dependOnP(x.substr(0, x.length - 6));
        return makeGob({ deps: q.providerAt("@DepInfo").deps })
    }
    throw "Cannot build " + x
}
function vari(x) {
    return y => y.$[x]
}
function makeDepInfo(d) {
    return [{ id: "@DepInfo", deps: d }]
}
function filegroup(opts) {
    buildRules += [function (x) {
        if (!x.startsWith(opts.name)) return;
        var f = {};
        for (var d of dependOnP(...opts.deps)) Object.assign(f, d.providerAt("@DefaultInfo").files)
        return makeGob([{ id: "@DefaultInfo", files: Object.assign({}, opts.files, f) }] + makeDepInfo(opts.deps))
    }]
}
function ninjaLibrary(opts) {
    var ninja = opts.buildFile;
    var rules = {}
    function query(x) {
        var d = barray2string(rexec("ninja -t deps " + x + ">.o", { "build.ninja": ninja })[".o"]).split('\n')
        var o = barray2string(rexec("ninja -t outputs " + x + ">.o", { "build.ninja": ninja })[".o"]).split('\n')
        var c = barray2string(rexec("ninja -t commands " + x + ">.o", { "build.ninja": ninja })[".o"]).split('\n')
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
        if (!rules[x]) return;
        var y = {};
        Object.assign(y, opts.tools)
        for (var z of rules[x].deps) Object.assign(y, dependOnP(":" + opts.name + "/" + z)[0].providerAt("@DefaultInfo").files);
        var res = rexec(rules[x].command, y, rules[x].outs);
        return makeGob([{ id: "@DefaultInfo", files: res }] + makeDepInfo(_.map(rules[x.deps], function (z) {
            return ":" + opts.name + "/" + z
        })))
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
            return makeGob([{ id: '@CCInfo', archive: pexec(`${$(x, vari("AR"))} crus $(find .) > '` + opts.name + ".a'", objFiles, [opts.name + ".a"], `Link CXX Library ${x}`)[opts.name + ".a"] }] + makeDepInfo(_.map(opts.srcs, x => ":" + opts.name + "/" + x)));
        };
        var y = x.substring(opts.name.length);
        y = y.substring(1);
        var llvm = $(x, y => y["cc.llvm"]);
        return makeGob([{ id: '@DefaultInfo', files: pexec(`${$(x, vari("AR"))} x ./*.a;${$(x, vari("CC"))} ${llvm ? '-S --emit-llvm' : ''} ` + y + " -c -o " + y + ".o" + opts.cflags, Object.assign({}, srcFiles, depFiles), [y + ".o"], `Compiling CXX object ${x}`) }] + makeDepInfo(opts.deps))
    }]
}
function goLibrary(opts) {
    buildRules += [function (x) {
        if (!x.startsWith(opts.name)) return;
        var srcs = dependOnP(opts.srcs);
        var garble = $(x, y => y["go.garble"]);
        var srcFiles = {};
        for (var s of srcs) Object.assign(srcFiles, s.providerAt("@DefaultInfo").files);
        return makeGob([{ id: "@GoInfo", lib: Object.assign(pexec(`${garble ? $(x, vari("GARBLE")) : ""} ${$(x, vari("GO"))} tool compile -p ${opts.importpath} -o ${opts.importpath} -pack $(ls *.go)`, srcFiles, [opts.importpath + ".a"]), ..._.map(dependOnP(..._.map(opts.deps, x => applyObj(x, { "go:garble": garble }))), d => d.providerAt("@GoInfo").lib)) }])
    }]
}
function aspect(opts) {
    buildRules += [function (x) {
        if (!x.startsWith(opts.name)) return;
        var over = 'Over%' + pkg(x) + ":" + opts.name + "%" + JSON.stringify($(x, opts.uniqueArgs));
        var tgt = $(x, y => y[over]);
        var providers = dependOnP(tgt);
        return makeGob(opts.impl({
            providers: providers,
            target: tgt,
            dependOn: x => dependOnP(":" + opts.name + `%${JSON.stringify({ [over]: x })}`)
        }))
    }]
}
function tar(opts){
    aspect({
        name: opts.name,
        uniqueArgs: x=>Object.assign({},x.$),
        impl: function(a){
            var files = {};
            var tfiles = {};
            if(opts.recursive)for(var d of a.providers.providerAt("@DepInfo").deps)Object.assign(tfiles, a.dependOn(d).providerAt("@DefaultInfo").files)
            files[a.tgt.replaceAll("//","/_/")] = rexec(`ls *.tar | xargs -I {} ${$(a.tgt, vari("TAR"))} -xvf {} -C res;tar -cvf tgt.tar -C res`,tfiles,["tgt.tar"])["tgt.tar"]
            return [{id: '@DefaultInfo', files: files}]
        }
    })
}
