function load(l){
    return dependOnS(l)[0];
}
function curl(url){
    return barray2string(exec("curl '" + url + "' > target",{},["target"])["target"])
}
function localPath(target){
    var s = target.split(':')
    return s[s.length-1]
}
function package(target){
    var s = target.split(':')
    s.pop()
    return s.join(':')
}
function makeGob(x){
    return string2barray(JSON.stringify(x))
}
function extractGob(x){
    return JSON.parse(barray2string(x))
}