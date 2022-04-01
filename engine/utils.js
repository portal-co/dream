(function () {
    var oldExec = exec;
    exec = function (a, b, c) {
        if (c === undefined) c = 'Build';
        return oldExec(a, b, c, JSON.stringify({ a: a, b: b, c: c }))
    }
})();
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
function package(target) {
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