(function () {
    var oldExec = exec;
    exec = function (a, b, c) {
        if (c === undefined) c = 'Build';
        return oldExec(a, b, c, JSON.stringify({ a: a, b: b, c: c }))
    }
})();
function rexec(a,b,c){
    var d = reserve();
    var e = exec(a,b,c);
    d();
    return e;
}
function load(l) {
    return barray2string(dependOn(l)[0]);
}
function curl(url) {
    return barray2string(exec("curl '" + url + "' > target", {}, ["target"])["target"])
}
function localPath(target) {
    var r = target.split('%')
    var s = r.split(':')
    r.shift()
    return s[s.length - 1] + "%" + r.join("%")
}
function pkg(target) {
    var t2 = target.split('%')
    target = t2[0]
    var s = target.split(':')
    s.pop()
    return s.join(':')
}
function makeGob(x) {
    return string2barray(JSON.stringify(x))
}
function extractGob(x) {
    return JSON.parse(barray2string(x))
}
function $(tgt,val){
    var a = tgt.split('%')
    a.shift();
    var b = a.join("%");
    return val(JSON.parse(b));
}
function applyObj(t,o){
    var t2 = t.split('%');
    var tgt = t2.shift();
    var x = t2.join('%');
    x = mergeJson(x, JSON.stringify(o));
    return tgt + '%' + x
}