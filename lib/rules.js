"use strict";

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _toConsumableArray(arr) { return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _unsupportedIterableToArray(arr) || _nonIterableSpread(); }

function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }

function _iterableToArray(iter) { if (typeof Symbol !== "undefined" && iter[Symbol.iterator] != null || iter["@@iterator"] != null) return Array.from(iter); }

function _arrayWithoutHoles(arr) { if (Array.isArray(arr)) return _arrayLikeToArray(arr); }

function _createForOfIteratorHelper(o, allowArrayLike) { var it = typeof Symbol !== "undefined" && o[Symbol.iterator] || o["@@iterator"]; if (!it) { if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") { if (it) o = it; var i = 0; var F = function F() {}; return { s: F, n: function n() { if (i >= o.length) return { done: true }; return { done: false, value: o[i++] }; }, e: function e(_e) { throw _e; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var normalCompletion = true, didErr = false, err; return { s: function s() { it = it.call(o); }, n: function n() { var step = it.next(); normalCompletion = step.done; return step; }, e: function e(_e2) { didErr = true; err = _e2; }, f: function f() { try { if (!normalCompletion && it["return"] != null) it["return"](); } finally { if (didErr) throw err; } } }; }

function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }

function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) { arr2[i] = arr[i]; } return arr2; }

function dependOnP() {
  return _.map(dependOn(arguments), extractGob);
}

Array.prototype.providerAt = function (x) {
  var _iterator = _createForOfIteratorHelper(this),
      _step;

  try {
    for (_iterator.s(); !(_step = _iterator.n()).done;) {
      var v = _step.value;
      if (v.id == x) return v;
    }
  } catch (err) {
    _iterator.e(err);
  } finally {
    _iterator.f();
  }

  return null;
};

buildRules = [];

function Build(x) {
  var _iterator2 = _createForOfIteratorHelper(buildRules),
      _step2;

  try {
    for (_iterator2.s(); !(_step2 = _iterator2.n()).done;) {
      var r = _step2.value;
      var s = r(x);
      if (s) return s;
    }
  } catch (err) {
    _iterator2.e(err);
  } finally {
    _iterator2.f();
  }

  throw "Cannot build " + x;
}

function vari(x) {
  return function (y) {
    return y.$[x];
  };
}

function makeDepInfo(d) {
  return [{
    id: "@DepInfo",
    deps: d
  }];
}

function filegroup(opts) {
  buildRules += [function (x) {
    if (!x.startsWith(opts.name)) return;
    var f = {};

    var _iterator3 = _createForOfIteratorHelper(dependOnP.apply(void 0, _toConsumableArray(opts.deps))),
        _step3;

    try {
      for (_iterator3.s(); !(_step3 = _iterator3.n()).done;) {
        var d = _step3.value;
        Object.assign(f, d.providerAt("@DefaultInfo").files);
      }
    } catch (err) {
      _iterator3.e(err);
    } finally {
      _iterator3.f();
    }

    return makeGob([{
      id: "@DefaultInfo",
      files: Object.assign({}, opts.files, f)
    }] + makeDepInfo(opts.deps));
  }];
}

function ninjaLibrary(opts) {
  var ninja = opts.buildFile;
  var rules = {};

  function query(x) {
    var d = barray2string(exec("ninja -t deps " + x + ">.o", {
      "build.ninja": ninja
    })[".o"]).split('\n');
    var o = barray2string(exec("ninja -t outputs " + x + ">.o", {
      "build.ninja": ninja
    })[".o"]).split('\n');
    var c = barray2string(exec("ninja -t commands " + x + ">.o", {
      "build.ninja": ninja
    })[".o"]).split('\n');
    c = c[c.length];

    if (c.startsWith('make')) {
      var flags = c.split(' ');
      var curdir = '.',
          file = 'Makefile';

      for (var i in flags) {
        if (flags[i] == '-C') curdir = flags[i + 1];
        if (flags[i] == '-f') file = flags[i + 1];
        makeLibrary({
          name: opts.name + "/" + curdir,
          tools: opts.tools,
          buildFile: dependOnP(':' + opts.name + "/" + file)[0].providerAt("@DefaultInfo").files[opts.name + "/" + file]
        });
      }

      ;
    } else if (c.startsWith('ninja')) {
      var flags = c.split(' ');
      var curdir = '.',
          file = 'build.ninja';

      for (var i in flags) {
        if (flags[i] == '-C') curdir = flags[i + 1];
        if (flags[i] == '-f') file = flags[i + 1];
        ninjaLibrary({
          name: opts.name + "/" + curdir,
          tools: opts.tools,
          buildFile: dependOnP(':' + opts.name + "/" + file)[0].providerAt("@DefaultInfo").files[opts.name + "/" + file]
        });
      }

      ;
    } else {
      rules[x] = {
        deps: d,
        command: c,
        outs: o
      };
    }

    var _iterator4 = _createForOfIteratorHelper(deps),
        _step4;

    try {
      for (_iterator4.s(); !(_step4 = _iterator4.n()).done;) {
        var _d = _step4.value;
        query(_d);
      }
    } catch (err) {
      _iterator4.e(err);
    } finally {
      _iterator4.f();
    }
  }

  buildRules += [function (x) {
    if (!x.startsWith(opts.name)) return;
    x = x.substr(opts.name.length);
    if (!rules[x]) return;
    var y = {};
    Object.assign(y, opts.tools);

    var _iterator5 = _createForOfIteratorHelper(rules[x].deps),
        _step5;

    try {
      for (_iterator5.s(); !(_step5 = _iterator5.n()).done;) {
        var z = _step5.value;
        Object.assign(y, dependOnP(":" + opts.name + "/" + z)[0].providerAt("@DefaultInfo").files);
      }
    } catch (err) {
      _iterator5.e(err);
    } finally {
      _iterator5.f();
    }

    var res = exec(rules[x].command, y, rules[x].outs);
    return makeGob([{
      id: "@DefaultInfo",
      files: res
    }] + makeDepInfo(_.map(rules[x.deps], function (z) {
      return ":" + opts.name + "/" + z;
    })));
  }];
  query(opts.main);
}

function makeLibrary(opts) {
  ninjaLibrary({
    name: opts.name,
    tools: opts.tools,
    buildFile: exec("ckati --ninja --gen_all_rules", Object.assign({
      "Makefile": opts.buildFile
    }, opts.tools), ["build.ninja"])["build.ninja"]
  });
}

function ccLibrary(opts) {
  buildRules += [function (x) {
    if (!x.startsWith(opts.name)) return;
    var srcs = dependOnP(opts.srcs);
    var srcFiles = {};

    var _iterator6 = _createForOfIteratorHelper(srcs),
        _step6;

    try {
      for (_iterator6.s(); !(_step6 = _iterator6.n()).done;) {
        var s = _step6.value;
        Object.assign(srcFiles, s.providerAt("@DefaultInfo").files);
      }
    } catch (err) {
      _iterator6.e(err);
    } finally {
      _iterator6.f();
    }

    var deps = dependOnP(opts.deps),
        depFiles = {};

    var _iterator7 = _createForOfIteratorHelper(deps),
        _step7;

    try {
      for (_iterator7.s(); !(_step7 = _iterator7.n()).done;) {
        var d = _step7.value;
        Object.assign(depFiles, d.providerAt("@CCInfo").archive);
      }
    } catch (err) {
      _iterator7.e(err);
    } finally {
      _iterator7.f();
    }

    if (x == opts.name) {
      var objs = dependOnP(_.map(opts.srcs, function (x) {
        return ":" + opts.name + "/" + x;
      })),
          objFiles = {};

      var _iterator8 = _createForOfIteratorHelper(objs),
          _step8;

      try {
        for (_iterator8.s(); !(_step8 = _iterator8.n()).done;) {
          var o = _step8.value;
          Object.assign(objFiles, o.providerAt("@DefaultInfo").files);
        }
      } catch (err) {
        _iterator8.e(err);
      } finally {
        _iterator8.f();
      }

      Object.assign(objFiles, srcFiles, depFiles);
      return makeGob([{
        id: '@CCInfo',
        archive: exec("".concat($(x, vari("AR")), " crus $(find .) > '") + opts.name + ".a'", objFiles, [opts.name + ".a"], "Link CXX Library ".concat(x))[opts.name + ".a"]
      }] + makeDepInfo(_.map(opts.srcs, function (x) {
        return ":" + opts.name + "/" + x;
      })));
    }

    ;
    var y = x.substring(opts.name.length);
    y = y.substring(1);
    var llvm = $(x, function (y) {
      return y["cc.llvm"];
    });
    return makeGob([{
      id: '@DefaultInfo',
      files: exec("".concat($(x, vari("AR")), " x ./*.a;").concat($(x, vari("CC")), " ").concat(llvm ? '-S --emit-llvm' : '', " ") + y + " -c -o " + y + ".o" + opts.cflags, Object.assign({}, srcFiles, depFiles), [y + ".o"], "Compiling CXX object ".concat(x))
    }] + makeDepInfo(opts.deps));
  }];
}

function goLibrary(opts) {
  buildRules += [function (x) {
    if (!x.startsWith(opts.name)) return;
    var srcs = dependOnP(opts.srcs);
    var garble = $(x, function (y) {
      return y["go.garble"];
    });
    var srcFiles = {};

    var _iterator9 = _createForOfIteratorHelper(srcs),
        _step9;

    try {
      for (_iterator9.s(); !(_step9 = _iterator9.n()).done;) {
        var s = _step9.value;
        Object.assign(srcFiles, s.providerAt("@DefaultInfo").files);
      }
    } catch (err) {
      _iterator9.e(err);
    } finally {
      _iterator9.f();
    }

    return makeGob([{
      id: "@GoInfo",
      lib: Object.assign.apply(Object, [exec("".concat(garble ? $(x, vari("GARBLE")) : "", " ").concat($(x, vari("GO")), " tool compile -p ").concat(opts.importpath, " -o ").concat(opts.importpath, " -pack $(ls *.go)"), srcFiles, [opts.importpath + ".a"])].concat(_toConsumableArray(_.map(dependOnP.apply(void 0, _toConsumableArray(_.map(opts.deps, function (x) {
        return applyObj(x, {
          "go:garble": garble
        });
      }))), function (d) {
        return d.providerAt("@GoInfo").lib;
      }))))
    }]);
  }];
}

function aspect(opts) {
  buildRules += [function (x) {
    if (!x.startsWith(opts.name)) return;
    var over = 'Over%' + pkg(x) + ":" + opts.name + "%" + JSON.stringify($(x, opts.uniqueArgs));
    var tgt = $(x, function (y) {
      return y[over];
    });
    var providers = dependOnP(tgt);
    return makeGob(opts.impl({
      providers: providers,
      target: tgt,
      dependOn: function dependOn(x) {
        return dependOnP(":" + opts.name + "%".concat(JSON.stringify(_defineProperty({}, over, x))));
      }
    }));
  }];
}

