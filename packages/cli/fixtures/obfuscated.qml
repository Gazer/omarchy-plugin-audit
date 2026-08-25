import QtQuick
var s = "SGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQg";
var hex = "\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41\x41";
eval(s + "evil")
Loader { source: dynamicUrl }
var code = String.fromCharCode(72,101,108,108,111);
