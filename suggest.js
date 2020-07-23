"use strict";
(function() {

Error.stackTraceLimit = Infinity;

var $global, $module;
if (typeof window !== "undefined") { /* web page */
  $global = window;
} else if (typeof self !== "undefined") { /* web worker */
  $global = self;
} else if (typeof global !== "undefined") { /* Node.js */
  $global = global;
  $global.require = require;
} else { /* others (e.g. Nashorn) */
  $global = this;
}

if ($global === undefined || $global.Array === undefined) {
  throw new Error("no global object found");
}
if (typeof module !== "undefined") {
  $module = module;
}

var $packages = {}, $idCounter = 0;
var $keys = function(m) { return m ? Object.keys(m) : []; };
var $flushConsole = function() {};
var $throwRuntimeError; /* set by package "runtime" */
var $throwNilPointerError = function() { $throwRuntimeError("invalid memory address or nil pointer dereference"); };
var $call = function(fn, rcvr, args) { return fn.apply(rcvr, args); };
var $makeFunc = function(fn) { return function() { return $externalize(fn(this, new ($sliceType($jsObjectPtr))($global.Array.prototype.slice.call(arguments, []))), $emptyInterface); }; };
var $unused = function(v) {};

var $mapArray = function(array, f) {
  var newArray = new array.constructor(array.length);
  for (var i = 0; i < array.length; i++) {
    newArray[i] = f(array[i]);
  }
  return newArray;
};

var $methodVal = function(recv, name) {
  var vals = recv.$methodVals || {};
  recv.$methodVals = vals; /* noop for primitives */
  var f = vals[name];
  if (f !== undefined) {
    return f;
  }
  var method = recv[name];
  f = function() {
    $stackDepthOffset--;
    try {
      return method.apply(recv, arguments);
    } finally {
      $stackDepthOffset++;
    }
  };
  vals[name] = f;
  return f;
};

var $methodExpr = function(typ, name) {
  var method = typ.prototype[name];
  if (method.$expr === undefined) {
    method.$expr = function() {
      $stackDepthOffset--;
      try {
        if (typ.wrapped) {
          arguments[0] = new typ(arguments[0]);
        }
        return Function.call.apply(method, arguments);
      } finally {
        $stackDepthOffset++;
      }
    };
  }
  return method.$expr;
};

var $ifaceMethodExprs = {};
var $ifaceMethodExpr = function(name) {
  var expr = $ifaceMethodExprs["$" + name];
  if (expr === undefined) {
    expr = $ifaceMethodExprs["$" + name] = function() {
      $stackDepthOffset--;
      try {
        return Function.call.apply(arguments[0][name], arguments);
      } finally {
        $stackDepthOffset++;
      }
    };
  }
  return expr;
};

var $subslice = function(slice, low, high, max) {
  if (high === undefined) {
    high = slice.$length;
  }
  if (max === undefined) {
    max = slice.$capacity;
  }
  if (low < 0 || high < low || max < high || high > slice.$capacity || max > slice.$capacity) {
    $throwRuntimeError("slice bounds out of range");
  }
  if (slice === slice.constructor.nil) {
    return slice;
  }
  var s = new slice.constructor(slice.$array);
  s.$offset = slice.$offset + low;
  s.$length = high - low;
  s.$capacity = max - low;
  return s;
};

var $substring = function(str, low, high) {
  if (low < 0 || high < low || high > str.length) {
    $throwRuntimeError("slice bounds out of range");
  }
  return str.substring(low, high);
};

var $sliceToArray = function(slice) {
  if (slice.$array.constructor !== Array) {
    return slice.$array.subarray(slice.$offset, slice.$offset + slice.$length);
  }
  return slice.$array.slice(slice.$offset, slice.$offset + slice.$length);
};

var $decodeRune = function(str, pos) {
  var c0 = str.charCodeAt(pos);

  if (c0 < 0x80) {
    return [c0, 1];
  }

  if (c0 !== c0 || c0 < 0xC0) {
    return [0xFFFD, 1];
  }

  var c1 = str.charCodeAt(pos + 1);
  if (c1 !== c1 || c1 < 0x80 || 0xC0 <= c1) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xE0) {
    var r = (c0 & 0x1F) << 6 | (c1 & 0x3F);
    if (r <= 0x7F) {
      return [0xFFFD, 1];
    }
    return [r, 2];
  }

  var c2 = str.charCodeAt(pos + 2);
  if (c2 !== c2 || c2 < 0x80 || 0xC0 <= c2) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xF0) {
    var r = (c0 & 0x0F) << 12 | (c1 & 0x3F) << 6 | (c2 & 0x3F);
    if (r <= 0x7FF) {
      return [0xFFFD, 1];
    }
    if (0xD800 <= r && r <= 0xDFFF) {
      return [0xFFFD, 1];
    }
    return [r, 3];
  }

  var c3 = str.charCodeAt(pos + 3);
  if (c3 !== c3 || c3 < 0x80 || 0xC0 <= c3) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xF8) {
    var r = (c0 & 0x07) << 18 | (c1 & 0x3F) << 12 | (c2 & 0x3F) << 6 | (c3 & 0x3F);
    if (r <= 0xFFFF || 0x10FFFF < r) {
      return [0xFFFD, 1];
    }
    return [r, 4];
  }

  return [0xFFFD, 1];
};

var $encodeRune = function(r) {
  if (r < 0 || r > 0x10FFFF || (0xD800 <= r && r <= 0xDFFF)) {
    r = 0xFFFD;
  }
  if (r <= 0x7F) {
    return String.fromCharCode(r);
  }
  if (r <= 0x7FF) {
    return String.fromCharCode(0xC0 | r >> 6, 0x80 | (r & 0x3F));
  }
  if (r <= 0xFFFF) {
    return String.fromCharCode(0xE0 | r >> 12, 0x80 | (r >> 6 & 0x3F), 0x80 | (r & 0x3F));
  }
  return String.fromCharCode(0xF0 | r >> 18, 0x80 | (r >> 12 & 0x3F), 0x80 | (r >> 6 & 0x3F), 0x80 | (r & 0x3F));
};

var $stringToBytes = function(str) {
  var array = new Uint8Array(str.length);
  for (var i = 0; i < str.length; i++) {
    array[i] = str.charCodeAt(i);
  }
  return array;
};

var $bytesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "";
  for (var i = 0; i < slice.$length; i += 10000) {
    str += String.fromCharCode.apply(undefined, slice.$array.subarray(slice.$offset + i, slice.$offset + Math.min(slice.$length, i + 10000)));
  }
  return str;
};

var $stringToRunes = function(str) {
  var array = new Int32Array(str.length);
  var rune, j = 0;
  for (var i = 0; i < str.length; i += rune[1], j++) {
    rune = $decodeRune(str, i);
    array[j] = rune[0];
  }
  return array.subarray(0, j);
};

var $runesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "";
  for (var i = 0; i < slice.$length; i++) {
    str += $encodeRune(slice.$array[slice.$offset + i]);
  }
  return str;
};

var $copyString = function(dst, src) {
  var n = Math.min(src.length, dst.$length);
  for (var i = 0; i < n; i++) {
    dst.$array[dst.$offset + i] = src.charCodeAt(i);
  }
  return n;
};

var $copySlice = function(dst, src) {
  var n = Math.min(src.$length, dst.$length);
  $copyArray(dst.$array, src.$array, dst.$offset, src.$offset, n, dst.constructor.elem);
  return n;
};

var $copyArray = function(dst, src, dstOffset, srcOffset, n, elem) {
  if (n === 0 || (dst === src && dstOffset === srcOffset)) {
    return;
  }

  if (src.subarray) {
    dst.set(src.subarray(srcOffset, srcOffset + n), dstOffset);
    return;
  }

  switch (elem.kind) {
  case $kindArray:
  case $kindStruct:
    if (dst === src && dstOffset > srcOffset) {
      for (var i = n - 1; i >= 0; i--) {
        elem.copy(dst[dstOffset + i], src[srcOffset + i]);
      }
      return;
    }
    for (var i = 0; i < n; i++) {
      elem.copy(dst[dstOffset + i], src[srcOffset + i]);
    }
    return;
  }

  if (dst === src && dstOffset > srcOffset) {
    for (var i = n - 1; i >= 0; i--) {
      dst[dstOffset + i] = src[srcOffset + i];
    }
    return;
  }
  for (var i = 0; i < n; i++) {
    dst[dstOffset + i] = src[srcOffset + i];
  }
};

var $clone = function(src, type) {
  var clone = type.zero();
  type.copy(clone, src);
  return clone;
};

var $pointerOfStructConversion = function(obj, type) {
  if(obj.$proxies === undefined) {
    obj.$proxies = {};
    obj.$proxies[obj.constructor.string] = obj;
  }
  var proxy = obj.$proxies[type.string];
  if (proxy === undefined) {
    var properties = {};
    for (var i = 0; i < type.elem.fields.length; i++) {
      (function(fieldProp) {
        properties[fieldProp] = {
          get: function() { return obj[fieldProp]; },
          set: function(value) { obj[fieldProp] = value; }
        };
      })(type.elem.fields[i].prop);
    }
    proxy = Object.create(type.prototype, properties);
    proxy.$val = proxy;
    obj.$proxies[type.string] = proxy;
    proxy.$proxies = obj.$proxies;
  }
  return proxy;
};

var $append = function(slice) {
  return $internalAppend(slice, arguments, 1, arguments.length - 1);
};

var $appendSlice = function(slice, toAppend) {
  if (toAppend.constructor === String) {
    var bytes = $stringToBytes(toAppend);
    return $internalAppend(slice, bytes, 0, bytes.length);
  }
  return $internalAppend(slice, toAppend.$array, toAppend.$offset, toAppend.$length);
};

var $internalAppend = function(slice, array, offset, length) {
  if (length === 0) {
    return slice;
  }

  var newArray = slice.$array;
  var newOffset = slice.$offset;
  var newLength = slice.$length + length;
  var newCapacity = slice.$capacity;

  if (newLength > newCapacity) {
    newOffset = 0;
    newCapacity = Math.max(newLength, slice.$capacity < 1024 ? slice.$capacity * 2 : Math.floor(slice.$capacity * 5 / 4));

    if (slice.$array.constructor === Array) {
      newArray = slice.$array.slice(slice.$offset, slice.$offset + slice.$length);
      newArray.length = newCapacity;
      var zero = slice.constructor.elem.zero;
      for (var i = slice.$length; i < newCapacity; i++) {
        newArray[i] = zero();
      }
    } else {
      newArray = new slice.$array.constructor(newCapacity);
      newArray.set(slice.$array.subarray(slice.$offset, slice.$offset + slice.$length));
    }
  }

  $copyArray(newArray, array, newOffset + slice.$length, offset, length, slice.constructor.elem);

  var newSlice = new slice.constructor(newArray);
  newSlice.$offset = newOffset;
  newSlice.$length = newLength;
  newSlice.$capacity = newCapacity;
  return newSlice;
};

var $equal = function(a, b, type) {
  if (type === $jsObjectPtr) {
    return a === b;
  }
  switch (type.kind) {
  case $kindComplex64:
  case $kindComplex128:
    return a.$real === b.$real && a.$imag === b.$imag;
  case $kindInt64:
  case $kindUint64:
    return a.$high === b.$high && a.$low === b.$low;
  case $kindArray:
    if (a.length !== b.length) {
      return false;
    }
    for (var i = 0; i < a.length; i++) {
      if (!$equal(a[i], b[i], type.elem)) {
        return false;
      }
    }
    return true;
  case $kindStruct:
    for (var i = 0; i < type.fields.length; i++) {
      var f = type.fields[i];
      if (!$equal(a[f.prop], b[f.prop], f.typ)) {
        return false;
      }
    }
    return true;
  case $kindInterface:
    return $interfaceIsEqual(a, b);
  default:
    return a === b;
  }
};

var $interfaceIsEqual = function(a, b) {
  if (a === $ifaceNil || b === $ifaceNil) {
    return a === b;
  }
  if (a.constructor !== b.constructor) {
    return false;
  }
  if (a.constructor === $jsObjectPtr) {
    return a.object === b.object;
  }
  if (!a.constructor.comparable) {
    $throwRuntimeError("comparing uncomparable type " + a.constructor.string);
  }
  return $equal(a.$val, b.$val, a.constructor);
};

var $min = Math.min;
var $mod = function(x, y) { return x % y; };
var $parseInt = parseInt;
var $parseFloat = function(f) {
  if (f !== undefined && f !== null && f.constructor === Number) {
    return f;
  }
  return parseFloat(f);
};

var $froundBuf = new Float32Array(1);
var $fround = Math.fround || function(f) {
  $froundBuf[0] = f;
  return $froundBuf[0];
};

var $imul = Math.imul || function(a, b) {
  var ah = (a >>> 16) & 0xffff;
  var al = a & 0xffff;
  var bh = (b >>> 16) & 0xffff;
  var bl = b & 0xffff;
  return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0) >> 0);
};

var $floatKey = function(f) {
  if (f !== f) {
    $idCounter++;
    return "NaN$" + $idCounter;
  }
  return String(f);
};

var $flatten64 = function(x) {
  return x.$high * 4294967296 + x.$low;
};

var $shiftLeft64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high << y | x.$low >>> (32 - y), (x.$low << y) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(x.$low << (y - 32), 0);
  }
  return new x.constructor(0, 0);
};

var $shiftRightInt64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high >> y, (x.$low >>> y | x.$high << (32 - y)) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(x.$high >> 31, (x.$high >> (y - 32)) >>> 0);
  }
  if (x.$high < 0) {
    return new x.constructor(-1, 4294967295);
  }
  return new x.constructor(0, 0);
};

var $shiftRightUint64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high >>> y, (x.$low >>> y | x.$high << (32 - y)) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(0, x.$high >>> (y - 32));
  }
  return new x.constructor(0, 0);
};

var $mul64 = function(x, y) {
  var high = 0, low = 0;
  if ((y.$low & 1) !== 0) {
    high = x.$high;
    low = x.$low;
  }
  for (var i = 1; i < 32; i++) {
    if ((y.$low & 1<<i) !== 0) {
      high += x.$high << i | x.$low >>> (32 - i);
      low += (x.$low << i) >>> 0;
    }
  }
  for (var i = 0; i < 32; i++) {
    if ((y.$high & 1<<i) !== 0) {
      high += x.$low << i;
    }
  }
  return new x.constructor(high, low);
};

var $div64 = function(x, y, returnRemainder) {
  if (y.$high === 0 && y.$low === 0) {
    $throwRuntimeError("integer divide by zero");
  }

  var s = 1;
  var rs = 1;

  var xHigh = x.$high;
  var xLow = x.$low;
  if (xHigh < 0) {
    s = -1;
    rs = -1;
    xHigh = -xHigh;
    if (xLow !== 0) {
      xHigh--;
      xLow = 4294967296 - xLow;
    }
  }

  var yHigh = y.$high;
  var yLow = y.$low;
  if (y.$high < 0) {
    s *= -1;
    yHigh = -yHigh;
    if (yLow !== 0) {
      yHigh--;
      yLow = 4294967296 - yLow;
    }
  }

  var high = 0, low = 0, n = 0;
  while (yHigh < 2147483648 && ((xHigh > yHigh) || (xHigh === yHigh && xLow > yLow))) {
    yHigh = (yHigh << 1 | yLow >>> 31) >>> 0;
    yLow = (yLow << 1) >>> 0;
    n++;
  }
  for (var i = 0; i <= n; i++) {
    high = high << 1 | low >>> 31;
    low = (low << 1) >>> 0;
    if ((xHigh > yHigh) || (xHigh === yHigh && xLow >= yLow)) {
      xHigh = xHigh - yHigh;
      xLow = xLow - yLow;
      if (xLow < 0) {
        xHigh--;
        xLow += 4294967296;
      }
      low++;
      if (low === 4294967296) {
        high++;
        low = 0;
      }
    }
    yLow = (yLow >>> 1 | yHigh << (32 - 1)) >>> 0;
    yHigh = yHigh >>> 1;
  }

  if (returnRemainder) {
    return new x.constructor(xHigh * rs, xLow * rs);
  }
  return new x.constructor(high * s, low * s);
};

var $divComplex = function(n, d) {
  var ninf = n.$real === Infinity || n.$real === -Infinity || n.$imag === Infinity || n.$imag === -Infinity;
  var dinf = d.$real === Infinity || d.$real === -Infinity || d.$imag === Infinity || d.$imag === -Infinity;
  var nnan = !ninf && (n.$real !== n.$real || n.$imag !== n.$imag);
  var dnan = !dinf && (d.$real !== d.$real || d.$imag !== d.$imag);
  if(nnan || dnan) {
    return new n.constructor(NaN, NaN);
  }
  if (ninf && !dinf) {
    return new n.constructor(Infinity, Infinity);
  }
  if (!ninf && dinf) {
    return new n.constructor(0, 0);
  }
  if (d.$real === 0 && d.$imag === 0) {
    if (n.$real === 0 && n.$imag === 0) {
      return new n.constructor(NaN, NaN);
    }
    return new n.constructor(Infinity, Infinity);
  }
  var a = Math.abs(d.$real);
  var b = Math.abs(d.$imag);
  if (a <= b) {
    var ratio = d.$real / d.$imag;
    var denom = d.$real * ratio + d.$imag;
    return new n.constructor((n.$real * ratio + n.$imag) / denom, (n.$imag * ratio - n.$real) / denom);
  }
  var ratio = d.$imag / d.$real;
  var denom = d.$imag * ratio + d.$real;
  return new n.constructor((n.$imag * ratio + n.$real) / denom, (n.$imag - n.$real * ratio) / denom);
};

var $kindBool = 1;
var $kindInt = 2;
var $kindInt8 = 3;
var $kindInt16 = 4;
var $kindInt32 = 5;
var $kindInt64 = 6;
var $kindUint = 7;
var $kindUint8 = 8;
var $kindUint16 = 9;
var $kindUint32 = 10;
var $kindUint64 = 11;
var $kindUintptr = 12;
var $kindFloat32 = 13;
var $kindFloat64 = 14;
var $kindComplex64 = 15;
var $kindComplex128 = 16;
var $kindArray = 17;
var $kindChan = 18;
var $kindFunc = 19;
var $kindInterface = 20;
var $kindMap = 21;
var $kindPtr = 22;
var $kindSlice = 23;
var $kindString = 24;
var $kindStruct = 25;
var $kindUnsafePointer = 26;

var $methodSynthesizers = [];
var $addMethodSynthesizer = function(f) {
  if ($methodSynthesizers === null) {
    f();
    return;
  }
  $methodSynthesizers.push(f);
};
var $synthesizeMethods = function() {
  $methodSynthesizers.forEach(function(f) { f(); });
  $methodSynthesizers = null;
};

var $ifaceKeyFor = function(x) {
  if (x === $ifaceNil) {
    return 'nil';
  }
  var c = x.constructor;
  return c.string + '$' + c.keyFor(x.$val);
};

var $identity = function(x) { return x; };

var $typeIDCounter = 0;

var $idKey = function(x) {
  if (x.$id === undefined) {
    $idCounter++;
    x.$id = $idCounter;
  }
  return String(x.$id);
};

var $newType = function(size, kind, string, named, pkg, exported, constructor) {
  var typ;
  switch(kind) {
  case $kindBool:
  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8:
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindUnsafePointer:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = $identity;
    break;

  case $kindString:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = function(x) { return "$" + x; };
    break;

  case $kindFloat32:
  case $kindFloat64:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = function(x) { return $floatKey(x); };
    break;

  case $kindInt64:
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$high + "$" + x.$low; };
    break;

  case $kindUint64:
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >>> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$high + "$" + x.$low; };
    break;

  case $kindComplex64:
    typ = function(real, imag) {
      this.$real = $fround(real);
      this.$imag = $fround(imag);
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$real + "$" + x.$imag; };
    break;

  case $kindComplex128:
    typ = function(real, imag) {
      this.$real = real;
      this.$imag = imag;
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$real + "$" + x.$imag; };
    break;

  case $kindArray:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.ptr = $newType(4, $kindPtr, "*" + string, false, "", false, function(array) {
      this.$get = function() { return array; };
      this.$set = function(v) { typ.copy(this, v); };
      this.$val = array;
    });
    typ.init = function(elem, len) {
      typ.elem = elem;
      typ.len = len;
      typ.comparable = elem.comparable;
      typ.keyFor = function(x) {
        return Array.prototype.join.call($mapArray(x, function(e) {
          return String(elem.keyFor(e)).replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
        }), "$");
      };
      typ.copy = function(dst, src) {
        $copyArray(dst, src, 0, 0, src.length, elem);
      };
      typ.ptr.init(typ);
      Object.defineProperty(typ.ptr.nil, "nilCheck", { get: $throwNilPointerError });
    };
    break;

  case $kindChan:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = $idKey;
    typ.init = function(elem, sendOnly, recvOnly) {
      typ.elem = elem;
      typ.sendOnly = sendOnly;
      typ.recvOnly = recvOnly;
    };
    break;

  case $kindFunc:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.init = function(params, results, variadic) {
      typ.params = params;
      typ.results = results;
      typ.variadic = variadic;
      typ.comparable = false;
    };
    break;

  case $kindInterface:
    typ = { implementedBy: {}, missingMethodFor: {} };
    typ.keyFor = $ifaceKeyFor;
    typ.init = function(methods) {
      typ.methods = methods;
      methods.forEach(function(m) {
        $ifaceNil[m.prop] = $throwNilPointerError;
      });
    };
    break;

  case $kindMap:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.init = function(key, elem) {
      typ.key = key;
      typ.elem = elem;
      typ.comparable = false;
    };
    break;

  case $kindPtr:
    typ = constructor || function(getter, setter, target) {
      this.$get = getter;
      this.$set = setter;
      this.$target = target;
      this.$val = this;
    };
    typ.keyFor = $idKey;
    typ.init = function(elem) {
      typ.elem = elem;
      typ.wrapped = (elem.kind === $kindArray);
      typ.nil = new typ($throwNilPointerError, $throwNilPointerError);
    };
    break;

  case $kindSlice:
    typ = function(array) {
      if (array.constructor !== typ.nativeArray) {
        array = new typ.nativeArray(array);
      }
      this.$array = array;
      this.$offset = 0;
      this.$length = array.length;
      this.$capacity = array.length;
      this.$val = this;
    };
    typ.init = function(elem) {
      typ.elem = elem;
      typ.comparable = false;
      typ.nativeArray = $nativeArray(elem.kind);
      typ.nil = new typ([]);
    };
    break;

  case $kindStruct:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.ptr = $newType(4, $kindPtr, "*" + string, false, pkg, exported, constructor);
    typ.ptr.elem = typ;
    typ.ptr.prototype.$get = function() { return this; };
    typ.ptr.prototype.$set = function(v) { typ.copy(this, v); };
    typ.init = function(pkgPath, fields) {
      typ.pkgPath = pkgPath;
      typ.fields = fields;
      fields.forEach(function(f) {
        if (!f.typ.comparable) {
          typ.comparable = false;
        }
      });
      typ.keyFor = function(x) {
        var val = x.$val;
        return $mapArray(fields, function(f) {
          return String(f.typ.keyFor(val[f.prop])).replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
        }).join("$");
      };
      typ.copy = function(dst, src) {
        for (var i = 0; i < fields.length; i++) {
          var f = fields[i];
          switch (f.typ.kind) {
          case $kindArray:
          case $kindStruct:
            f.typ.copy(dst[f.prop], src[f.prop]);
            continue;
          default:
            dst[f.prop] = src[f.prop];
            continue;
          }
        }
      };
      /* nil value */
      var properties = {};
      fields.forEach(function(f) {
        properties[f.prop] = { get: $throwNilPointerError, set: $throwNilPointerError };
      });
      typ.ptr.nil = Object.create(constructor.prototype, properties);
      typ.ptr.nil.$val = typ.ptr.nil;
      /* methods for embedded fields */
      $addMethodSynthesizer(function() {
        var synthesizeMethod = function(target, m, f) {
          if (target.prototype[m.prop] !== undefined) { return; }
          target.prototype[m.prop] = function() {
            var v = this.$val[f.prop];
            if (f.typ === $jsObjectPtr) {
              v = new $jsObjectPtr(v);
            }
            if (v.$val === undefined) {
              v = new f.typ(v);
            }
            return v[m.prop].apply(v, arguments);
          };
        };
        fields.forEach(function(f) {
          if (f.embedded) {
            $methodSet(f.typ).forEach(function(m) {
              synthesizeMethod(typ, m, f);
              synthesizeMethod(typ.ptr, m, f);
            });
            $methodSet($ptrType(f.typ)).forEach(function(m) {
              synthesizeMethod(typ.ptr, m, f);
            });
          }
        });
      });
    };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  switch (kind) {
  case $kindBool:
  case $kindMap:
    typ.zero = function() { return false; };
    break;

  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8 :
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindUnsafePointer:
  case $kindFloat32:
  case $kindFloat64:
    typ.zero = function() { return 0; };
    break;

  case $kindString:
    typ.zero = function() { return ""; };
    break;

  case $kindInt64:
  case $kindUint64:
  case $kindComplex64:
  case $kindComplex128:
    var zero = new typ(0, 0);
    typ.zero = function() { return zero; };
    break;

  case $kindPtr:
  case $kindSlice:
    typ.zero = function() { return typ.nil; };
    break;

  case $kindChan:
    typ.zero = function() { return $chanNil; };
    break;

  case $kindFunc:
    typ.zero = function() { return $throwNilPointerError; };
    break;

  case $kindInterface:
    typ.zero = function() { return $ifaceNil; };
    break;

  case $kindArray:
    typ.zero = function() {
      var arrayClass = $nativeArray(typ.elem.kind);
      if (arrayClass !== Array) {
        return new arrayClass(typ.len);
      }
      var array = new Array(typ.len);
      for (var i = 0; i < typ.len; i++) {
        array[i] = typ.elem.zero();
      }
      return array;
    };
    break;

  case $kindStruct:
    typ.zero = function() { return new typ.ptr(); };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  typ.id = $typeIDCounter;
  $typeIDCounter++;
  typ.size = size;
  typ.kind = kind;
  typ.string = string;
  typ.named = named;
  typ.pkg = pkg;
  typ.exported = exported;
  typ.methods = [];
  typ.methodSetCache = null;
  typ.comparable = true;
  return typ;
};

var $methodSet = function(typ) {
  if (typ.methodSetCache !== null) {
    return typ.methodSetCache;
  }
  var base = {};

  var isPtr = (typ.kind === $kindPtr);
  if (isPtr && typ.elem.kind === $kindInterface) {
    typ.methodSetCache = [];
    return [];
  }

  var current = [{typ: isPtr ? typ.elem : typ, indirect: isPtr}];

  var seen = {};

  while (current.length > 0) {
    var next = [];
    var mset = [];

    current.forEach(function(e) {
      if (seen[e.typ.string]) {
        return;
      }
      seen[e.typ.string] = true;

      if (e.typ.named) {
        mset = mset.concat(e.typ.methods);
        if (e.indirect) {
          mset = mset.concat($ptrType(e.typ).methods);
        }
      }

      switch (e.typ.kind) {
      case $kindStruct:
        e.typ.fields.forEach(function(f) {
          if (f.embedded) {
            var fTyp = f.typ;
            var fIsPtr = (fTyp.kind === $kindPtr);
            next.push({typ: fIsPtr ? fTyp.elem : fTyp, indirect: e.indirect || fIsPtr});
          }
        });
        break;

      case $kindInterface:
        mset = mset.concat(e.typ.methods);
        break;
      }
    });

    mset.forEach(function(m) {
      if (base[m.name] === undefined) {
        base[m.name] = m;
      }
    });

    current = next;
  }

  typ.methodSetCache = [];
  Object.keys(base).sort().forEach(function(name) {
    typ.methodSetCache.push(base[name]);
  });
  return typ.methodSetCache;
};

var $Bool          = $newType( 1, $kindBool,          "bool",           true, "", false, null);
var $Int           = $newType( 4, $kindInt,           "int",            true, "", false, null);
var $Int8          = $newType( 1, $kindInt8,          "int8",           true, "", false, null);
var $Int16         = $newType( 2, $kindInt16,         "int16",          true, "", false, null);
var $Int32         = $newType( 4, $kindInt32,         "int32",          true, "", false, null);
var $Int64         = $newType( 8, $kindInt64,         "int64",          true, "", false, null);
var $Uint          = $newType( 4, $kindUint,          "uint",           true, "", false, null);
var $Uint8         = $newType( 1, $kindUint8,         "uint8",          true, "", false, null);
var $Uint16        = $newType( 2, $kindUint16,        "uint16",         true, "", false, null);
var $Uint32        = $newType( 4, $kindUint32,        "uint32",         true, "", false, null);
var $Uint64        = $newType( 8, $kindUint64,        "uint64",         true, "", false, null);
var $Uintptr       = $newType( 4, $kindUintptr,       "uintptr",        true, "", false, null);
var $Float32       = $newType( 4, $kindFloat32,       "float32",        true, "", false, null);
var $Float64       = $newType( 8, $kindFloat64,       "float64",        true, "", false, null);
var $Complex64     = $newType( 8, $kindComplex64,     "complex64",      true, "", false, null);
var $Complex128    = $newType(16, $kindComplex128,    "complex128",     true, "", false, null);
var $String        = $newType( 8, $kindString,        "string",         true, "", false, null);
var $UnsafePointer = $newType( 4, $kindUnsafePointer, "unsafe.Pointer", true, "", false, null);

var $nativeArray = function(elemKind) {
  switch (elemKind) {
  case $kindInt:
    return Int32Array;
  case $kindInt8:
    return Int8Array;
  case $kindInt16:
    return Int16Array;
  case $kindInt32:
    return Int32Array;
  case $kindUint:
    return Uint32Array;
  case $kindUint8:
    return Uint8Array;
  case $kindUint16:
    return Uint16Array;
  case $kindUint32:
    return Uint32Array;
  case $kindUintptr:
    return Uint32Array;
  case $kindFloat32:
    return Float32Array;
  case $kindFloat64:
    return Float64Array;
  default:
    return Array;
  }
};
var $toNativeArray = function(elemKind, array) {
  var nativeArray = $nativeArray(elemKind);
  if (nativeArray === Array) {
    return array;
  }
  return new nativeArray(array);
};
var $arrayTypes = {};
var $arrayType = function(elem, len) {
  var typeKey = elem.id + "$" + len;
  var typ = $arrayTypes[typeKey];
  if (typ === undefined) {
    typ = $newType(12, $kindArray, "[" + len + "]" + elem.string, false, "", false, null);
    $arrayTypes[typeKey] = typ;
    typ.init(elem, len);
  }
  return typ;
};

var $chanType = function(elem, sendOnly, recvOnly) {
  var string = (recvOnly ? "<-" : "") + "chan" + (sendOnly ? "<- " : " ") + elem.string;
  var field = sendOnly ? "SendChan" : (recvOnly ? "RecvChan" : "Chan");
  var typ = elem[field];
  if (typ === undefined) {
    typ = $newType(4, $kindChan, string, false, "", false, null);
    elem[field] = typ;
    typ.init(elem, sendOnly, recvOnly);
  }
  return typ;
};
var $Chan = function(elem, capacity) {
  if (capacity < 0 || capacity > 2147483647) {
    $throwRuntimeError("makechan: size out of range");
  }
  this.$elem = elem;
  this.$capacity = capacity;
  this.$buffer = [];
  this.$sendQueue = [];
  this.$recvQueue = [];
  this.$closed = false;
};
var $chanNil = new $Chan(null, 0);
$chanNil.$sendQueue = $chanNil.$recvQueue = { length: 0, push: function() {}, shift: function() { return undefined; }, indexOf: function() { return -1; } };

var $funcTypes = {};
var $funcType = function(params, results, variadic) {
  var typeKey = $mapArray(params, function(p) { return p.id; }).join(",") + "$" + $mapArray(results, function(r) { return r.id; }).join(",") + "$" + variadic;
  var typ = $funcTypes[typeKey];
  if (typ === undefined) {
    var paramTypes = $mapArray(params, function(p) { return p.string; });
    if (variadic) {
      paramTypes[paramTypes.length - 1] = "..." + paramTypes[paramTypes.length - 1].substr(2);
    }
    var string = "func(" + paramTypes.join(", ") + ")";
    if (results.length === 1) {
      string += " " + results[0].string;
    } else if (results.length > 1) {
      string += " (" + $mapArray(results, function(r) { return r.string; }).join(", ") + ")";
    }
    typ = $newType(4, $kindFunc, string, false, "", false, null);
    $funcTypes[typeKey] = typ;
    typ.init(params, results, variadic);
  }
  return typ;
};

var $interfaceTypes = {};
var $interfaceType = function(methods) {
  var typeKey = $mapArray(methods, function(m) { return m.pkg + "," + m.name + "," + m.typ.id; }).join("$");
  var typ = $interfaceTypes[typeKey];
  if (typ === undefined) {
    var string = "interface {}";
    if (methods.length !== 0) {
      string = "interface { " + $mapArray(methods, function(m) {
        return (m.pkg !== "" ? m.pkg + "." : "") + m.name + m.typ.string.substr(4);
      }).join("; ") + " }";
    }
    typ = $newType(8, $kindInterface, string, false, "", false, null);
    $interfaceTypes[typeKey] = typ;
    typ.init(methods);
  }
  return typ;
};
var $emptyInterface = $interfaceType([]);
var $ifaceNil = {};
var $error = $newType(8, $kindInterface, "error", true, "", false, null);
$error.init([{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}]);

var $mapTypes = {};
var $mapType = function(key, elem) {
  var typeKey = key.id + "$" + elem.id;
  var typ = $mapTypes[typeKey];
  if (typ === undefined) {
    typ = $newType(4, $kindMap, "map[" + key.string + "]" + elem.string, false, "", false, null);
    $mapTypes[typeKey] = typ;
    typ.init(key, elem);
  }
  return typ;
};
var $makeMap = function(keyForFunc, entries) {
  var m = {};
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    m[keyForFunc(e.k)] = e;
  }
  return m;
};

var $ptrType = function(elem) {
  var typ = elem.ptr;
  if (typ === undefined) {
    typ = $newType(4, $kindPtr, "*" + elem.string, false, "", elem.exported, null);
    elem.ptr = typ;
    typ.init(elem);
  }
  return typ;
};

var $newDataPointer = function(data, constructor) {
  if (constructor.elem.kind === $kindStruct) {
    return data;
  }
  return new constructor(function() { return data; }, function(v) { data = v; });
};

var $indexPtr = function(array, index, constructor) {
  array.$ptr = array.$ptr || {};
  return array.$ptr[index] || (array.$ptr[index] = new constructor(function() { return array[index]; }, function(v) { array[index] = v; }));
};

var $sliceType = function(elem) {
  var typ = elem.slice;
  if (typ === undefined) {
    typ = $newType(12, $kindSlice, "[]" + elem.string, false, "", false, null);
    elem.slice = typ;
    typ.init(elem);
  }
  return typ;
};
var $makeSlice = function(typ, length, capacity) {
  capacity = capacity || length;
  if (length < 0 || length > 2147483647) {
    $throwRuntimeError("makeslice: len out of range");
  }
  if (capacity < 0 || capacity < length || capacity > 2147483647) {
    $throwRuntimeError("makeslice: cap out of range");
  }
  var array = new typ.nativeArray(capacity);
  if (typ.nativeArray === Array) {
    for (var i = 0; i < capacity; i++) {
      array[i] = typ.elem.zero();
    }
  }
  var slice = new typ(array);
  slice.$length = length;
  return slice;
};

var $structTypes = {};
var $structType = function(pkgPath, fields) {
  var typeKey = $mapArray(fields, function(f) { return f.name + "," + f.typ.id + "," + f.tag; }).join("$");
  var typ = $structTypes[typeKey];
  if (typ === undefined) {
    var string = "struct { " + $mapArray(fields, function(f) {
      return f.name + " " + f.typ.string + (f.tag !== "" ? (" \"" + f.tag.replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"") : "");
    }).join("; ") + " }";
    if (fields.length === 0) {
      string = "struct {}";
    }
    typ = $newType(0, $kindStruct, string, false, "", false, function() {
      this.$val = this;
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        var arg = arguments[i];
        this[f.prop] = arg !== undefined ? arg : f.typ.zero();
      }
    });
    $structTypes[typeKey] = typ;
    typ.init(pkgPath, fields);
  }
  return typ;
};

var $assertType = function(value, type, returnTuple) {
  var isInterface = (type.kind === $kindInterface), ok, missingMethod = "";
  if (value === $ifaceNil) {
    ok = false;
  } else if (!isInterface) {
    ok = value.constructor === type;
  } else {
    var valueTypeString = value.constructor.string;
    ok = type.implementedBy[valueTypeString];
    if (ok === undefined) {
      ok = true;
      var valueMethodSet = $methodSet(value.constructor);
      var interfaceMethods = type.methods;
      for (var i = 0; i < interfaceMethods.length; i++) {
        var tm = interfaceMethods[i];
        var found = false;
        for (var j = 0; j < valueMethodSet.length; j++) {
          var vm = valueMethodSet[j];
          if (vm.name === tm.name && vm.pkg === tm.pkg && vm.typ === tm.typ) {
            found = true;
            break;
          }
        }
        if (!found) {
          ok = false;
          type.missingMethodFor[valueTypeString] = tm.name;
          break;
        }
      }
      type.implementedBy[valueTypeString] = ok;
    }
    if (!ok) {
      missingMethod = type.missingMethodFor[valueTypeString];
    }
  }

  if (!ok) {
    if (returnTuple) {
      return [type.zero(), false];
    }
    $panic(new $packages["runtime"].TypeAssertionError.ptr(
      $packages["runtime"]._type.ptr.nil,
      (value === $ifaceNil ? $packages["runtime"]._type.ptr.nil : new $packages["runtime"]._type.ptr(value.constructor.string)),
      new $packages["runtime"]._type.ptr(type.string),
      missingMethod));
  }

  if (!isInterface) {
    value = value.$val;
  }
  if (type === $jsObjectPtr) {
    value = value.object;
  }
  return returnTuple ? [value, true] : value;
};

var $stackDepthOffset = 0;
var $getStackDepth = function() {
  var err = new Error();
  if (err.stack === undefined) {
    return undefined;
  }
  return $stackDepthOffset + err.stack.split("\n").length;
};

var $panicStackDepth = null, $panicValue;
var $callDeferred = function(deferred, jsErr, fromPanic) {
  if (!fromPanic && deferred !== null && deferred.index >= $curGoroutine.deferStack.length) {
    throw jsErr;
  }
  if (jsErr !== null) {
    var newErr = null;
    try {
      $curGoroutine.deferStack.push(deferred);
      $panic(new $jsErrorPtr(jsErr));
    } catch (err) {
      newErr = err;
    }
    $curGoroutine.deferStack.pop();
    $callDeferred(deferred, newErr);
    return;
  }
  if ($curGoroutine.asleep) {
    return;
  }

  $stackDepthOffset--;
  var outerPanicStackDepth = $panicStackDepth;
  var outerPanicValue = $panicValue;

  var localPanicValue = $curGoroutine.panicStack.pop();
  if (localPanicValue !== undefined) {
    $panicStackDepth = $getStackDepth();
    $panicValue = localPanicValue;
  }

  try {
    while (true) {
      if (deferred === null) {
        deferred = $curGoroutine.deferStack[$curGoroutine.deferStack.length - 1];
        if (deferred === undefined) {
          /* The panic reached the top of the stack. Clear it and throw it as a JavaScript error. */
          $panicStackDepth = null;
          if (localPanicValue.Object instanceof Error) {
            throw localPanicValue.Object;
          }
          var msg;
          if (localPanicValue.constructor === $String) {
            msg = localPanicValue.$val;
          } else if (localPanicValue.Error !== undefined) {
            msg = localPanicValue.Error();
          } else if (localPanicValue.String !== undefined) {
            msg = localPanicValue.String();
          } else {
            msg = localPanicValue;
          }
          throw new Error(msg);
        }
      }
      var call = deferred.pop();
      if (call === undefined) {
        $curGoroutine.deferStack.pop();
        if (localPanicValue !== undefined) {
          deferred = null;
          continue;
        }
        return;
      }
      var r = call[0].apply(call[2], call[1]);
      if (r && r.$blk !== undefined) {
        deferred.push([r.$blk, [], r]);
        if (fromPanic) {
          throw null;
        }
        return;
      }

      if (localPanicValue !== undefined && $panicStackDepth === null) {
        throw null; /* error was recovered */
      }
    }
  } finally {
    if (localPanicValue !== undefined) {
      if ($panicStackDepth !== null) {
        $curGoroutine.panicStack.push(localPanicValue);
      }
      $panicStackDepth = outerPanicStackDepth;
      $panicValue = outerPanicValue;
    }
    $stackDepthOffset++;
  }
};

var $panic = function(value) {
  $curGoroutine.panicStack.push(value);
  $callDeferred(null, null, true);
};
var $recover = function() {
  if ($panicStackDepth === null || ($panicStackDepth !== undefined && $panicStackDepth !== $getStackDepth() - 2)) {
    return $ifaceNil;
  }
  $panicStackDepth = null;
  return $panicValue;
};
var $throw = function(err) { throw err; };

var $noGoroutine = { asleep: false, exit: false, deferStack: [], panicStack: [] };
var $curGoroutine = $noGoroutine, $totalGoroutines = 0, $awakeGoroutines = 0, $checkForDeadlock = true;
var $mainFinished = false;
var $go = function(fun, args) {
  $totalGoroutines++;
  $awakeGoroutines++;
  var $goroutine = function() {
    try {
      $curGoroutine = $goroutine;
      var r = fun.apply(undefined, args);
      if (r && r.$blk !== undefined) {
        fun = function() { return r.$blk(); };
        args = [];
        return;
      }
      $goroutine.exit = true;
    } catch (err) {
      if (!$goroutine.exit) {
        throw err;
      }
    } finally {
      $curGoroutine = $noGoroutine;
      if ($goroutine.exit) { /* also set by runtime.Goexit() */
        $totalGoroutines--;
        $goroutine.asleep = true;
      }
      if ($goroutine.asleep) {
        $awakeGoroutines--;
        if (!$mainFinished && $awakeGoroutines === 0 && $checkForDeadlock) {
          console.error("fatal error: all goroutines are asleep - deadlock!");
          if ($global.process !== undefined) {
            $global.process.exit(2);
          }
        }
      }
    }
  };
  $goroutine.asleep = false;
  $goroutine.exit = false;
  $goroutine.deferStack = [];
  $goroutine.panicStack = [];
  $schedule($goroutine);
};

var $scheduled = [];
var $runScheduled = function() {
  try {
    var r;
    while ((r = $scheduled.shift()) !== undefined) {
      r();
    }
  } finally {
    if ($scheduled.length > 0) {
      setTimeout($runScheduled, 0);
    }
  }
};

var $schedule = function(goroutine) {
  if (goroutine.asleep) {
    goroutine.asleep = false;
    $awakeGoroutines++;
  }
  $scheduled.push(goroutine);
  if ($curGoroutine === $noGoroutine) {
    $runScheduled();
  }
};

var $setTimeout = function(f, t) {
  $awakeGoroutines++;
  return setTimeout(function() {
    $awakeGoroutines--;
    f();
  }, t);
};

var $block = function() {
  if ($curGoroutine === $noGoroutine) {
    $throwRuntimeError("cannot block in JavaScript callback, fix by wrapping code in goroutine");
  }
  $curGoroutine.asleep = true;
};

var $send = function(chan, value) {
  if (chan.$closed) {
    $throwRuntimeError("send on closed channel");
  }
  var queuedRecv = chan.$recvQueue.shift();
  if (queuedRecv !== undefined) {
    queuedRecv([value, true]);
    return;
  }
  if (chan.$buffer.length < chan.$capacity) {
    chan.$buffer.push(value);
    return;
  }

  var thisGoroutine = $curGoroutine;
  var closedDuringSend;
  chan.$sendQueue.push(function(closed) {
    closedDuringSend = closed;
    $schedule(thisGoroutine);
    return value;
  });
  $block();
  return {
    $blk: function() {
      if (closedDuringSend) {
        $throwRuntimeError("send on closed channel");
      }
    }
  };
};
var $recv = function(chan) {
  var queuedSend = chan.$sendQueue.shift();
  if (queuedSend !== undefined) {
    chan.$buffer.push(queuedSend(false));
  }
  var bufferedValue = chan.$buffer.shift();
  if (bufferedValue !== undefined) {
    return [bufferedValue, true];
  }
  if (chan.$closed) {
    return [chan.$elem.zero(), false];
  }

  var thisGoroutine = $curGoroutine;
  var f = { $blk: function() { return this.value; } };
  var queueEntry = function(v) {
    f.value = v;
    $schedule(thisGoroutine);
  };
  chan.$recvQueue.push(queueEntry);
  $block();
  return f;
};
var $close = function(chan) {
  if (chan.$closed) {
    $throwRuntimeError("close of closed channel");
  }
  chan.$closed = true;
  while (true) {
    var queuedSend = chan.$sendQueue.shift();
    if (queuedSend === undefined) {
      break;
    }
    queuedSend(true); /* will panic */
  }
  while (true) {
    var queuedRecv = chan.$recvQueue.shift();
    if (queuedRecv === undefined) {
      break;
    }
    queuedRecv([chan.$elem.zero(), false]);
  }
};
var $select = function(comms) {
  var ready = [];
  var selection = -1;
  for (var i = 0; i < comms.length; i++) {
    var comm = comms[i];
    var chan = comm[0];
    switch (comm.length) {
    case 0: /* default */
      selection = i;
      break;
    case 1: /* recv */
      if (chan.$sendQueue.length !== 0 || chan.$buffer.length !== 0 || chan.$closed) {
        ready.push(i);
      }
      break;
    case 2: /* send */
      if (chan.$closed) {
        $throwRuntimeError("send on closed channel");
      }
      if (chan.$recvQueue.length !== 0 || chan.$buffer.length < chan.$capacity) {
        ready.push(i);
      }
      break;
    }
  }

  if (ready.length !== 0) {
    selection = ready[Math.floor(Math.random() * ready.length)];
  }
  if (selection !== -1) {
    var comm = comms[selection];
    switch (comm.length) {
    case 0: /* default */
      return [selection];
    case 1: /* recv */
      return [selection, $recv(comm[0])];
    case 2: /* send */
      $send(comm[0], comm[1]);
      return [selection];
    }
  }

  var entries = [];
  var thisGoroutine = $curGoroutine;
  var f = { $blk: function() { return this.selection; } };
  var removeFromQueues = function() {
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var queue = entry[0];
      var index = queue.indexOf(entry[1]);
      if (index !== -1) {
        queue.splice(index, 1);
      }
    }
  };
  for (var i = 0; i < comms.length; i++) {
    (function(i) {
      var comm = comms[i];
      switch (comm.length) {
      case 1: /* recv */
        var queueEntry = function(value) {
          f.selection = [i, value];
          removeFromQueues();
          $schedule(thisGoroutine);
        };
        entries.push([comm[0].$recvQueue, queueEntry]);
        comm[0].$recvQueue.push(queueEntry);
        break;
      case 2: /* send */
        var queueEntry = function() {
          if (comm[0].$closed) {
            $throwRuntimeError("send on closed channel");
          }
          f.selection = [i];
          removeFromQueues();
          $schedule(thisGoroutine);
          return comm[1];
        };
        entries.push([comm[0].$sendQueue, queueEntry]);
        comm[0].$sendQueue.push(queueEntry);
        break;
      }
    })(i);
  }
  $block();
  return f;
};

var $jsObjectPtr, $jsErrorPtr;

var $needsExternalization = function(t) {
  switch (t.kind) {
    case $kindBool:
    case $kindInt:
    case $kindInt8:
    case $kindInt16:
    case $kindInt32:
    case $kindUint:
    case $kindUint8:
    case $kindUint16:
    case $kindUint32:
    case $kindUintptr:
    case $kindFloat32:
    case $kindFloat64:
      return false;
    default:
      return t !== $jsObjectPtr;
  }
};

var $externalize = function(v, t) {
  if (t === $jsObjectPtr) {
    return v;
  }
  switch (t.kind) {
  case $kindBool:
  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8:
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindFloat32:
  case $kindFloat64:
    return v;
  case $kindInt64:
  case $kindUint64:
    return $flatten64(v);
  case $kindArray:
    if ($needsExternalization(t.elem)) {
      return $mapArray(v, function(e) { return $externalize(e, t.elem); });
    }
    return v;
  case $kindFunc:
    return $externalizeFunction(v, t, false);
  case $kindInterface:
    if (v === $ifaceNil) {
      return null;
    }
    if (v.constructor === $jsObjectPtr) {
      return v.$val.object;
    }
    return $externalize(v.$val, v.constructor);
  case $kindMap:
    var m = {};
    var keys = $keys(v);
    for (var i = 0; i < keys.length; i++) {
      var entry = v[keys[i]];
      m[$externalize(entry.k, t.key)] = $externalize(entry.v, t.elem);
    }
    return m;
  case $kindPtr:
    if (v === t.nil) {
      return null;
    }
    return $externalize(v.$get(), t.elem);
  case $kindSlice:
    if ($needsExternalization(t.elem)) {
      return $mapArray($sliceToArray(v), function(e) { return $externalize(e, t.elem); });
    }
    return $sliceToArray(v);
  case $kindString:
    if ($isASCII(v)) {
      return v;
    }
    var s = "", r;
    for (var i = 0; i < v.length; i += r[1]) {
      r = $decodeRune(v, i);
      var c = r[0];
      if (c > 0xFFFF) {
        var h = Math.floor((c - 0x10000) / 0x400) + 0xD800;
        var l = (c - 0x10000) % 0x400 + 0xDC00;
        s += String.fromCharCode(h, l);
        continue;
      }
      s += String.fromCharCode(c);
    }
    return s;
  case $kindStruct:
    var timePkg = $packages["time"];
    if (timePkg !== undefined && v.constructor === timePkg.Time.ptr) {
      var milli = $div64(v.UnixNano(), new $Int64(0, 1000000));
      return new Date($flatten64(milli));
    }

    var noJsObject = {};
    var searchJsObject = function(v, t) {
      if (t === $jsObjectPtr) {
        return v;
      }
      switch (t.kind) {
      case $kindPtr:
        if (v === t.nil) {
          return noJsObject;
        }
        return searchJsObject(v.$get(), t.elem);
      case $kindStruct:
        var f = t.fields[0];
        return searchJsObject(v[f.prop], f.typ);
      case $kindInterface:
        return searchJsObject(v.$val, v.constructor);
      default:
        return noJsObject;
      }
    };
    var o = searchJsObject(v, t);
    if (o !== noJsObject) {
      return o;
    }

    o = {};
    for (var i = 0; i < t.fields.length; i++) {
      var f = t.fields[i];
      if (!f.exported) {
        continue;
      }
      o[f.name] = $externalize(v[f.prop], f.typ);
    }
    return o;
  }
  $throwRuntimeError("cannot externalize " + t.string);
};

var $externalizeFunction = function(v, t, passThis) {
  if (v === $throwNilPointerError) {
    return null;
  }
  if (v.$externalizeWrapper === undefined) {
    $checkForDeadlock = false;
    v.$externalizeWrapper = function() {
      var args = [];
      for (var i = 0; i < t.params.length; i++) {
        if (t.variadic && i === t.params.length - 1) {
          var vt = t.params[i].elem, varargs = [];
          for (var j = i; j < arguments.length; j++) {
            varargs.push($internalize(arguments[j], vt));
          }
          args.push(new (t.params[i])(varargs));
          break;
        }
        args.push($internalize(arguments[i], t.params[i]));
      }
      var result = v.apply(passThis ? this : undefined, args);
      switch (t.results.length) {
      case 0:
        return;
      case 1:
        return $externalize(result, t.results[0]);
      default:
        for (var i = 0; i < t.results.length; i++) {
          result[i] = $externalize(result[i], t.results[i]);
        }
        return result;
      }
    };
  }
  return v.$externalizeWrapper;
};

var $internalize = function(v, t, recv) {
  if (t === $jsObjectPtr) {
    return v;
  }
  if (t === $jsObjectPtr.elem) {
    $throwRuntimeError("cannot internalize js.Object, use *js.Object instead");
  }
  if (v && v.__internal_object__ !== undefined) {
    return $assertType(v.__internal_object__, t, false);
  }
  var timePkg = $packages["time"];
  if (timePkg !== undefined && t === timePkg.Time) {
    if (!(v !== null && v !== undefined && v.constructor === Date)) {
      $throwRuntimeError("cannot internalize time.Time from " + typeof v + ", must be Date");
    }
    return timePkg.Unix(new $Int64(0, 0), new $Int64(0, v.getTime() * 1000000));
  }
  switch (t.kind) {
  case $kindBool:
    return !!v;
  case $kindInt:
    return parseInt(v);
  case $kindInt8:
    return parseInt(v) << 24 >> 24;
  case $kindInt16:
    return parseInt(v) << 16 >> 16;
  case $kindInt32:
    return parseInt(v) >> 0;
  case $kindUint:
    return parseInt(v);
  case $kindUint8:
    return parseInt(v) << 24 >>> 24;
  case $kindUint16:
    return parseInt(v) << 16 >>> 16;
  case $kindUint32:
  case $kindUintptr:
    return parseInt(v) >>> 0;
  case $kindInt64:
  case $kindUint64:
    return new t(0, v);
  case $kindFloat32:
  case $kindFloat64:
    return parseFloat(v);
  case $kindArray:
    if (v.length !== t.len) {
      $throwRuntimeError("got array with wrong size from JavaScript native");
    }
    return $mapArray(v, function(e) { return $internalize(e, t.elem); });
  case $kindFunc:
    return function() {
      var args = [];
      for (var i = 0; i < t.params.length; i++) {
        if (t.variadic && i === t.params.length - 1) {
          var vt = t.params[i].elem, varargs = arguments[i];
          for (var j = 0; j < varargs.$length; j++) {
            args.push($externalize(varargs.$array[varargs.$offset + j], vt));
          }
          break;
        }
        args.push($externalize(arguments[i], t.params[i]));
      }
      var result = v.apply(recv, args);
      switch (t.results.length) {
      case 0:
        return;
      case 1:
        return $internalize(result, t.results[0]);
      default:
        for (var i = 0; i < t.results.length; i++) {
          result[i] = $internalize(result[i], t.results[i]);
        }
        return result;
      }
    };
  case $kindInterface:
    if (t.methods.length !== 0) {
      $throwRuntimeError("cannot internalize " + t.string);
    }
    if (v === null) {
      return $ifaceNil;
    }
    if (v === undefined) {
      return new $jsObjectPtr(undefined);
    }
    switch (v.constructor) {
    case Int8Array:
      return new ($sliceType($Int8))(v);
    case Int16Array:
      return new ($sliceType($Int16))(v);
    case Int32Array:
      return new ($sliceType($Int))(v);
    case Uint8Array:
      return new ($sliceType($Uint8))(v);
    case Uint16Array:
      return new ($sliceType($Uint16))(v);
    case Uint32Array:
      return new ($sliceType($Uint))(v);
    case Float32Array:
      return new ($sliceType($Float32))(v);
    case Float64Array:
      return new ($sliceType($Float64))(v);
    case Array:
      return $internalize(v, $sliceType($emptyInterface));
    case Boolean:
      return new $Bool(!!v);
    case Date:
      if (timePkg === undefined) {
        /* time package is not present, internalize as &js.Object{Date} so it can be externalized into original Date. */
        return new $jsObjectPtr(v);
      }
      return new timePkg.Time($internalize(v, timePkg.Time));
    case Function:
      var funcType = $funcType([$sliceType($emptyInterface)], [$jsObjectPtr], true);
      return new funcType($internalize(v, funcType));
    case Number:
      return new $Float64(parseFloat(v));
    case String:
      return new $String($internalize(v, $String));
    default:
      if ($global.Node && v instanceof $global.Node) {
        return new $jsObjectPtr(v);
      }
      var mapType = $mapType($String, $emptyInterface);
      return new mapType($internalize(v, mapType));
    }
  case $kindMap:
    var m = {};
    var keys = $keys(v);
    for (var i = 0; i < keys.length; i++) {
      var k = $internalize(keys[i], t.key);
      m[t.key.keyFor(k)] = { k: k, v: $internalize(v[keys[i]], t.elem) };
    }
    return m;
  case $kindPtr:
    if (t.elem.kind === $kindStruct) {
      return $internalize(v, t.elem);
    }
  case $kindSlice:
    return new t($mapArray(v, function(e) { return $internalize(e, t.elem); }));
  case $kindString:
    v = String(v);
    if ($isASCII(v)) {
      return v;
    }
    var s = "";
    var i = 0;
    while (i < v.length) {
      var h = v.charCodeAt(i);
      if (0xD800 <= h && h <= 0xDBFF) {
        var l = v.charCodeAt(i + 1);
        var c = (h - 0xD800) * 0x400 + l - 0xDC00 + 0x10000;
        s += $encodeRune(c);
        i += 2;
        continue;
      }
      s += $encodeRune(h);
      i++;
    }
    return s;
  case $kindStruct:
    var noJsObject = {};
    var searchJsObject = function(t) {
      if (t === $jsObjectPtr) {
        return v;
      }
      if (t === $jsObjectPtr.elem) {
        $throwRuntimeError("cannot internalize js.Object, use *js.Object instead");
      }
      switch (t.kind) {
      case $kindPtr:
        return searchJsObject(t.elem);
      case $kindStruct:
        var f = t.fields[0];
        var o = searchJsObject(f.typ);
        if (o !== noJsObject) {
          var n = new t.ptr();
          n[f.prop] = o;
          return n;
        }
        return noJsObject;
      default:
        return noJsObject;
      }
    };
    var o = searchJsObject(t);
    if (o !== noJsObject) {
      return o;
    }
  }
  $throwRuntimeError("cannot internalize " + t.string);
};

/* $isASCII reports whether string s contains only ASCII characters. */
var $isASCII = function(s) {
  for (var i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) >= 128) {
      return false;
    }
  }
  return true;
};

$packages["github.com/gopherjs/gopherjs/js"] = (function() {
	var $pkg = {}, $init, Object, Error, sliceType, ptrType, ptrType$1, init;
	Object = $pkg.Object = $newType(0, $kindStruct, "js.Object", true, "github.com/gopherjs/gopherjs/js", true, function(object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.object = null;
			return;
		}
		this.object = object_;
	});
	Error = $pkg.Error = $newType(0, $kindStruct, "js.Error", true, "github.com/gopherjs/gopherjs/js", true, function(Object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Object = null;
			return;
		}
		this.Object = Object_;
	});
	sliceType = $sliceType($emptyInterface);
	ptrType = $ptrType(Object);
	ptrType$1 = $ptrType(Error);
	Object.ptr.prototype.Get = function(key) {
		var key, o;
		o = this;
		return o.object[$externalize(key, $String)];
	};
	Object.prototype.Get = function(key) { return this.$val.Get(key); };
	Object.ptr.prototype.Set = function(key, value) {
		var key, o, value;
		o = this;
		o.object[$externalize(key, $String)] = $externalize(value, $emptyInterface);
	};
	Object.prototype.Set = function(key, value) { return this.$val.Set(key, value); };
	Object.ptr.prototype.Delete = function(key) {
		var key, o;
		o = this;
		delete o.object[$externalize(key, $String)];
	};
	Object.prototype.Delete = function(key) { return this.$val.Delete(key); };
	Object.ptr.prototype.Length = function() {
		var o;
		o = this;
		return $parseInt(o.object.length);
	};
	Object.prototype.Length = function() { return this.$val.Length(); };
	Object.ptr.prototype.Index = function(i) {
		var i, o;
		o = this;
		return o.object[i];
	};
	Object.prototype.Index = function(i) { return this.$val.Index(i); };
	Object.ptr.prototype.SetIndex = function(i, value) {
		var i, o, value;
		o = this;
		o.object[i] = $externalize(value, $emptyInterface);
	};
	Object.prototype.SetIndex = function(i, value) { return this.$val.SetIndex(i, value); };
	Object.ptr.prototype.Call = function(name, args) {
		var args, name, o, obj;
		o = this;
		return (obj = o.object, obj[$externalize(name, $String)].apply(obj, $externalize(args, sliceType)));
	};
	Object.prototype.Call = function(name, args) { return this.$val.Call(name, args); };
	Object.ptr.prototype.Invoke = function(args) {
		var args, o;
		o = this;
		return o.object.apply(undefined, $externalize(args, sliceType));
	};
	Object.prototype.Invoke = function(args) { return this.$val.Invoke(args); };
	Object.ptr.prototype.New = function(args) {
		var args, o;
		o = this;
		return new ($global.Function.prototype.bind.apply(o.object, [undefined].concat($externalize(args, sliceType))));
	};
	Object.prototype.New = function(args) { return this.$val.New(args); };
	Object.ptr.prototype.Bool = function() {
		var o;
		o = this;
		return !!(o.object);
	};
	Object.prototype.Bool = function() { return this.$val.Bool(); };
	Object.ptr.prototype.String = function() {
		var o;
		o = this;
		return $internalize(o.object, $String);
	};
	Object.prototype.String = function() { return this.$val.String(); };
	Object.ptr.prototype.Int = function() {
		var o;
		o = this;
		return $parseInt(o.object) >> 0;
	};
	Object.prototype.Int = function() { return this.$val.Int(); };
	Object.ptr.prototype.Int64 = function() {
		var o;
		o = this;
		return $internalize(o.object, $Int64);
	};
	Object.prototype.Int64 = function() { return this.$val.Int64(); };
	Object.ptr.prototype.Uint64 = function() {
		var o;
		o = this;
		return $internalize(o.object, $Uint64);
	};
	Object.prototype.Uint64 = function() { return this.$val.Uint64(); };
	Object.ptr.prototype.Float = function() {
		var o;
		o = this;
		return $parseFloat(o.object);
	};
	Object.prototype.Float = function() { return this.$val.Float(); };
	Object.ptr.prototype.Interface = function() {
		var o;
		o = this;
		return $internalize(o.object, $emptyInterface);
	};
	Object.prototype.Interface = function() { return this.$val.Interface(); };
	Object.ptr.prototype.Unsafe = function() {
		var o;
		o = this;
		return o.object;
	};
	Object.prototype.Unsafe = function() { return this.$val.Unsafe(); };
	Error.ptr.prototype.Error = function() {
		var err;
		err = this;
		return "JavaScript error: " + $internalize(err.Object.message, $String);
	};
	Error.prototype.Error = function() { return this.$val.Error(); };
	Error.ptr.prototype.Stack = function() {
		var err;
		err = this;
		return $internalize(err.Object.stack, $String);
	};
	Error.prototype.Stack = function() { return this.$val.Stack(); };
	init = function() {
		var e;
		e = new Error.ptr(null);
		$unused(e);
	};
	ptrType.methods = [{prop: "Get", name: "Get", pkg: "", typ: $funcType([$String], [ptrType], false)}, {prop: "Set", name: "Set", pkg: "", typ: $funcType([$String, $emptyInterface], [], false)}, {prop: "Delete", name: "Delete", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Length", name: "Length", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Index", name: "Index", pkg: "", typ: $funcType([$Int], [ptrType], false)}, {prop: "SetIndex", name: "SetIndex", pkg: "", typ: $funcType([$Int, $emptyInterface], [], false)}, {prop: "Call", name: "Call", pkg: "", typ: $funcType([$String, sliceType], [ptrType], true)}, {prop: "Invoke", name: "Invoke", pkg: "", typ: $funcType([sliceType], [ptrType], true)}, {prop: "New", name: "New", pkg: "", typ: $funcType([sliceType], [ptrType], true)}, {prop: "Bool", name: "Bool", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Int", name: "Int", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Int64", name: "Int64", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "Uint64", name: "Uint64", pkg: "", typ: $funcType([], [$Uint64], false)}, {prop: "Float", name: "Float", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Interface", name: "Interface", pkg: "", typ: $funcType([], [$emptyInterface], false)}, {prop: "Unsafe", name: "Unsafe", pkg: "", typ: $funcType([], [$Uintptr], false)}];
	ptrType$1.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Stack", name: "Stack", pkg: "", typ: $funcType([], [$String], false)}];
	Object.init("github.com/gopherjs/gopherjs/js", [{prop: "object", name: "object", embedded: false, exported: false, typ: ptrType, tag: ""}]);
	Error.init("", [{prop: "Object", name: "Object", embedded: true, exported: true, typ: ptrType, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["internal/cpu"] = (function() {
	var $pkg = {}, $init;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["internal/bytealg"] = (function() {
	var $pkg = {}, $init, cpu;
	cpu = $packages["internal/cpu"];
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = cpu.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["runtime/internal/sys"] = (function() {
	var $pkg = {}, $init;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["runtime"] = (function() {
	var $pkg = {}, $init, js, bytealg, sys, _type, TypeAssertionError, errorString, ptrType, ptrType$4, init, GOROOT, Goexit, throw$1;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	bytealg = $packages["internal/bytealg"];
	sys = $packages["runtime/internal/sys"];
	_type = $pkg._type = $newType(0, $kindStruct, "runtime._type", true, "runtime", false, function(str_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.str = "";
			return;
		}
		this.str = str_;
	});
	TypeAssertionError = $pkg.TypeAssertionError = $newType(0, $kindStruct, "runtime.TypeAssertionError", true, "runtime", true, function(_interface_, concrete_, asserted_, missingMethod_) {
		this.$val = this;
		if (arguments.length === 0) {
			this._interface = ptrType.nil;
			this.concrete = ptrType.nil;
			this.asserted = ptrType.nil;
			this.missingMethod = "";
			return;
		}
		this._interface = _interface_;
		this.concrete = concrete_;
		this.asserted = asserted_;
		this.missingMethod = missingMethod_;
	});
	errorString = $pkg.errorString = $newType(8, $kindString, "runtime.errorString", true, "runtime", false, null);
	ptrType = $ptrType(_type);
	ptrType$4 = $ptrType(TypeAssertionError);
	_type.ptr.prototype.string = function() {
		var t;
		t = this;
		return t.str;
	};
	_type.prototype.string = function() { return this.$val.string(); };
	_type.ptr.prototype.pkgpath = function() {
		var t;
		t = this;
		return "";
	};
	_type.prototype.pkgpath = function() { return this.$val.pkgpath(); };
	init = function() {
		var e, jsPkg;
		jsPkg = $packages[$externalize("github.com/gopherjs/gopherjs/js", $String)];
		$jsObjectPtr = jsPkg.Object.ptr;
		$jsErrorPtr = jsPkg.Error.ptr;
		$throwRuntimeError = throw$1;
		e = $ifaceNil;
		e = new TypeAssertionError.ptr(ptrType.nil, ptrType.nil, ptrType.nil, "");
		$unused(e);
	};
	GOROOT = function() {
		var process, v, v$1;
		process = $global.process;
		if (process === undefined) {
			return "/";
		}
		v = process.env.GOPHERJS_GOROOT;
		if (!(v === undefined)) {
			return $internalize(v, $String);
		} else {
			v$1 = process.env.GOROOT;
			if (!(v$1 === undefined)) {
				return $internalize(v$1, $String);
			}
		}
		return "/usr/local/go";
	};
	$pkg.GOROOT = GOROOT;
	Goexit = function() {
		$curGoroutine.exit = $externalize(true, $Bool);
		$throw(null);
	};
	$pkg.Goexit = Goexit;
	throw$1 = function(s) {
		var s;
		$panic(new errorString((s)));
	};
	TypeAssertionError.ptr.prototype.RuntimeError = function() {
	};
	TypeAssertionError.prototype.RuntimeError = function() { return this.$val.RuntimeError(); };
	TypeAssertionError.ptr.prototype.Error = function() {
		var as, cs, e, inter, msg;
		e = this;
		inter = "interface";
		if (!(e._interface === ptrType.nil)) {
			inter = e._interface.string();
		}
		as = e.asserted.string();
		if (e.concrete === ptrType.nil) {
			return "interface conversion: " + inter + " is nil, not " + as;
		}
		cs = e.concrete.string();
		if (e.missingMethod === "") {
			msg = "interface conversion: " + inter + " is " + cs + ", not " + as;
			if (cs === as) {
				if (!(e.concrete.pkgpath() === e.asserted.pkgpath())) {
					msg = msg + (" (types from different packages)");
				} else {
					msg = msg + (" (types from different scopes)");
				}
			}
			return msg;
		}
		return "interface conversion: " + cs + " is not " + as + ": missing method " + e.missingMethod;
	};
	TypeAssertionError.prototype.Error = function() { return this.$val.Error(); };
	errorString.prototype.RuntimeError = function() {
		var e;
		e = this.$val;
	};
	$ptrType(errorString).prototype.RuntimeError = function() { return new errorString(this.$get()).RuntimeError(); };
	errorString.prototype.Error = function() {
		var e;
		e = this.$val;
		return "runtime error: " + (e);
	};
	$ptrType(errorString).prototype.Error = function() { return new errorString(this.$get()).Error(); };
	ptrType.methods = [{prop: "string", name: "string", pkg: "runtime", typ: $funcType([], [$String], false)}, {prop: "pkgpath", name: "pkgpath", pkg: "runtime", typ: $funcType([], [$String], false)}];
	ptrType$4.methods = [{prop: "RuntimeError", name: "RuntimeError", pkg: "", typ: $funcType([], [], false)}, {prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	errorString.methods = [{prop: "RuntimeError", name: "RuntimeError", pkg: "", typ: $funcType([], [], false)}, {prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	_type.init("runtime", [{prop: "str", name: "str", embedded: false, exported: false, typ: $String, tag: ""}]);
	TypeAssertionError.init("runtime", [{prop: "_interface", name: "_interface", embedded: false, exported: false, typ: ptrType, tag: ""}, {prop: "concrete", name: "concrete", embedded: false, exported: false, typ: ptrType, tag: ""}, {prop: "asserted", name: "asserted", embedded: false, exported: false, typ: ptrType, tag: ""}, {prop: "missingMethod", name: "missingMethod", embedded: false, exported: false, typ: $String, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = bytealg.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = sys.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["github.com/siongui/godom"] = (function() {
	var $pkg = {}, $init, js, CSSStyleDeclaration, Object, DOMRect, Event, DOMTokenList, funcType, ptrType, sliceType, ptrType$1, ptrType$2, ptrType$3, ptrType$4, sliceType$1;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	CSSStyleDeclaration = $pkg.CSSStyleDeclaration = $newType(0, $kindStruct, "godom.CSSStyleDeclaration", true, "github.com/siongui/godom", true, function(Object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Object = null;
			return;
		}
		this.Object = Object_;
	});
	Object = $pkg.Object = $newType(0, $kindStruct, "godom.Object", true, "github.com/siongui/godom", true, function(Object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Object = null;
			return;
		}
		this.Object = Object_;
	});
	DOMRect = $pkg.DOMRect = $newType(0, $kindStruct, "godom.DOMRect", true, "github.com/siongui/godom", true, function(Object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Object = null;
			return;
		}
		this.Object = Object_;
	});
	Event = $pkg.Event = $newType(0, $kindStruct, "godom.Event", true, "github.com/siongui/godom", true, function(Object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Object = null;
			return;
		}
		this.Object = Object_;
	});
	DOMTokenList = $pkg.DOMTokenList = $newType(0, $kindStruct, "godom.DOMTokenList", true, "github.com/siongui/godom", true, function(Object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Object = null;
			return;
		}
		this.Object = Object_;
	});
	funcType = $funcType([Event], [], false);
	ptrType = $ptrType(Object);
	sliceType = $sliceType(ptrType);
	ptrType$1 = $ptrType(CSSStyleDeclaration);
	ptrType$2 = $ptrType(js.Object);
	ptrType$3 = $ptrType(DOMTokenList);
	ptrType$4 = $ptrType(DOMRect);
	sliceType$1 = $sliceType($emptyInterface);
	CSSStyleDeclaration.ptr.prototype.CssText = function() {
		var s;
		s = this;
		return $internalize(s.Object.cssText, $String);
	};
	CSSStyleDeclaration.prototype.CssText = function() { return this.$val.CssText(); };
	CSSStyleDeclaration.ptr.prototype.Length = function() {
		var s;
		s = this;
		return $parseInt(s.Object.length) >> 0;
	};
	CSSStyleDeclaration.prototype.Length = function() { return this.$val.Length(); };
	CSSStyleDeclaration.ptr.prototype.AlignContent = function() {
		var s;
		s = this;
		return $internalize(s.Object.alignContent, $String);
	};
	CSSStyleDeclaration.prototype.AlignContent = function() { return this.$val.AlignContent(); };
	CSSStyleDeclaration.ptr.prototype.SetAlignContent = function(v) {
		var s, v;
		s = this;
		s.Object.alignContent = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAlignContent = function(v) { return this.$val.SetAlignContent(v); };
	CSSStyleDeclaration.ptr.prototype.AlignItems = function() {
		var s;
		s = this;
		return $internalize(s.Object.alignItems, $String);
	};
	CSSStyleDeclaration.prototype.AlignItems = function() { return this.$val.AlignItems(); };
	CSSStyleDeclaration.ptr.prototype.SetAlignItems = function(v) {
		var s, v;
		s = this;
		s.Object.alignItems = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAlignItems = function(v) { return this.$val.SetAlignItems(v); };
	CSSStyleDeclaration.ptr.prototype.AlignSelf = function() {
		var s;
		s = this;
		return $internalize(s.Object.alignSelf, $String);
	};
	CSSStyleDeclaration.prototype.AlignSelf = function() { return this.$val.AlignSelf(); };
	CSSStyleDeclaration.ptr.prototype.SetAlignSelf = function(v) {
		var s, v;
		s = this;
		s.Object.alignSelf = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAlignSelf = function(v) { return this.$val.SetAlignSelf(v); };
	CSSStyleDeclaration.ptr.prototype.Animation = function() {
		var s;
		s = this;
		return $internalize(s.Object.animation, $String);
	};
	CSSStyleDeclaration.prototype.Animation = function() { return this.$val.Animation(); };
	CSSStyleDeclaration.ptr.prototype.SetAnimation = function(v) {
		var s, v;
		s = this;
		s.Object.animation = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAnimation = function(v) { return this.$val.SetAnimation(v); };
	CSSStyleDeclaration.ptr.prototype.AnimationDelay = function() {
		var s;
		s = this;
		return $internalize(s.Object.animationDelay, $String);
	};
	CSSStyleDeclaration.prototype.AnimationDelay = function() { return this.$val.AnimationDelay(); };
	CSSStyleDeclaration.ptr.prototype.SetAnimationDelay = function(v) {
		var s, v;
		s = this;
		s.Object.animationDelay = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAnimationDelay = function(v) { return this.$val.SetAnimationDelay(v); };
	CSSStyleDeclaration.ptr.prototype.AnimationDirection = function() {
		var s;
		s = this;
		return $internalize(s.Object.animationDirection, $String);
	};
	CSSStyleDeclaration.prototype.AnimationDirection = function() { return this.$val.AnimationDirection(); };
	CSSStyleDeclaration.ptr.prototype.SetAnimationDirection = function(v) {
		var s, v;
		s = this;
		s.Object.animationDirection = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAnimationDirection = function(v) { return this.$val.SetAnimationDirection(v); };
	CSSStyleDeclaration.ptr.prototype.AnimationDuration = function() {
		var s;
		s = this;
		return $internalize(s.Object.animationDuration, $String);
	};
	CSSStyleDeclaration.prototype.AnimationDuration = function() { return this.$val.AnimationDuration(); };
	CSSStyleDeclaration.ptr.prototype.SetAnimationDuration = function(v) {
		var s, v;
		s = this;
		s.Object.animationDuration = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAnimationDuration = function(v) { return this.$val.SetAnimationDuration(v); };
	CSSStyleDeclaration.ptr.prototype.AnimationFillMode = function() {
		var s;
		s = this;
		return $internalize(s.Object.animationFillMode, $String);
	};
	CSSStyleDeclaration.prototype.AnimationFillMode = function() { return this.$val.AnimationFillMode(); };
	CSSStyleDeclaration.ptr.prototype.SetAnimationFillMode = function(v) {
		var s, v;
		s = this;
		s.Object.animationFillMode = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAnimationFillMode = function(v) { return this.$val.SetAnimationFillMode(v); };
	CSSStyleDeclaration.ptr.prototype.AnimationIterationCount = function() {
		var s;
		s = this;
		return $internalize(s.Object.animationIterationCount, $String);
	};
	CSSStyleDeclaration.prototype.AnimationIterationCount = function() { return this.$val.AnimationIterationCount(); };
	CSSStyleDeclaration.ptr.prototype.SetAnimationIterationCount = function(v) {
		var s, v;
		s = this;
		s.Object.animationIterationCount = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAnimationIterationCount = function(v) { return this.$val.SetAnimationIterationCount(v); };
	CSSStyleDeclaration.ptr.prototype.AnimationName = function() {
		var s;
		s = this;
		return $internalize(s.Object.animationName, $String);
	};
	CSSStyleDeclaration.prototype.AnimationName = function() { return this.$val.AnimationName(); };
	CSSStyleDeclaration.ptr.prototype.SetAnimationName = function(v) {
		var s, v;
		s = this;
		s.Object.animationName = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAnimationName = function(v) { return this.$val.SetAnimationName(v); };
	CSSStyleDeclaration.ptr.prototype.AnimationTimingFunction = function() {
		var s;
		s = this;
		return $internalize(s.Object.animationTimingFunction, $String);
	};
	CSSStyleDeclaration.prototype.AnimationTimingFunction = function() { return this.$val.AnimationTimingFunction(); };
	CSSStyleDeclaration.ptr.prototype.SetAnimationTimingFunction = function(v) {
		var s, v;
		s = this;
		s.Object.animationTimingFunction = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAnimationTimingFunction = function(v) { return this.$val.SetAnimationTimingFunction(v); };
	CSSStyleDeclaration.ptr.prototype.AnimationPlayState = function() {
		var s;
		s = this;
		return $internalize(s.Object.animationPlayState, $String);
	};
	CSSStyleDeclaration.prototype.AnimationPlayState = function() { return this.$val.AnimationPlayState(); };
	CSSStyleDeclaration.ptr.prototype.SetAnimationPlayState = function(v) {
		var s, v;
		s = this;
		s.Object.animationPlayState = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetAnimationPlayState = function(v) { return this.$val.SetAnimationPlayState(v); };
	CSSStyleDeclaration.ptr.prototype.Background = function() {
		var s;
		s = this;
		return $internalize(s.Object.background, $String);
	};
	CSSStyleDeclaration.prototype.Background = function() { return this.$val.Background(); };
	CSSStyleDeclaration.ptr.prototype.SetBackground = function(v) {
		var s, v;
		s = this;
		s.Object.background = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBackground = function(v) { return this.$val.SetBackground(v); };
	CSSStyleDeclaration.ptr.prototype.BackgroundAttachment = function() {
		var s;
		s = this;
		return $internalize(s.Object.backgroundAttachment, $String);
	};
	CSSStyleDeclaration.prototype.BackgroundAttachment = function() { return this.$val.BackgroundAttachment(); };
	CSSStyleDeclaration.ptr.prototype.SetBackgroundAttachment = function(v) {
		var s, v;
		s = this;
		s.Object.backgroundAttachment = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBackgroundAttachment = function(v) { return this.$val.SetBackgroundAttachment(v); };
	CSSStyleDeclaration.ptr.prototype.BackgroundColor = function() {
		var s;
		s = this;
		return $internalize(s.Object.backgroundColor, $String);
	};
	CSSStyleDeclaration.prototype.BackgroundColor = function() { return this.$val.BackgroundColor(); };
	CSSStyleDeclaration.ptr.prototype.SetBackgroundColor = function(v) {
		var s, v;
		s = this;
		s.Object.backgroundColor = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBackgroundColor = function(v) { return this.$val.SetBackgroundColor(v); };
	CSSStyleDeclaration.ptr.prototype.BackgroundImage = function() {
		var s;
		s = this;
		return $internalize(s.Object.backgroundImage, $String);
	};
	CSSStyleDeclaration.prototype.BackgroundImage = function() { return this.$val.BackgroundImage(); };
	CSSStyleDeclaration.ptr.prototype.SetBackgroundImage = function(v) {
		var s, v;
		s = this;
		s.Object.backgroundImage = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBackgroundImage = function(v) { return this.$val.SetBackgroundImage(v); };
	CSSStyleDeclaration.ptr.prototype.BackgroundPosition = function() {
		var s;
		s = this;
		return $internalize(s.Object.backgroundPosition, $String);
	};
	CSSStyleDeclaration.prototype.BackgroundPosition = function() { return this.$val.BackgroundPosition(); };
	CSSStyleDeclaration.ptr.prototype.SetBackgroundPosition = function(v) {
		var s, v;
		s = this;
		s.Object.backgroundPosition = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBackgroundPosition = function(v) { return this.$val.SetBackgroundPosition(v); };
	CSSStyleDeclaration.ptr.prototype.BackgroundRepeat = function() {
		var s;
		s = this;
		return $internalize(s.Object.backgroundRepeat, $String);
	};
	CSSStyleDeclaration.prototype.BackgroundRepeat = function() { return this.$val.BackgroundRepeat(); };
	CSSStyleDeclaration.ptr.prototype.SetBackgroundRepeat = function(v) {
		var s, v;
		s = this;
		s.Object.backgroundRepeat = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBackgroundRepeat = function(v) { return this.$val.SetBackgroundRepeat(v); };
	CSSStyleDeclaration.ptr.prototype.BackgroundClip = function() {
		var s;
		s = this;
		return $internalize(s.Object.backgroundClip, $String);
	};
	CSSStyleDeclaration.prototype.BackgroundClip = function() { return this.$val.BackgroundClip(); };
	CSSStyleDeclaration.ptr.prototype.SetBackgroundClip = function(v) {
		var s, v;
		s = this;
		s.Object.backgroundClip = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBackgroundClip = function(v) { return this.$val.SetBackgroundClip(v); };
	CSSStyleDeclaration.ptr.prototype.BackgroundOrigin = function() {
		var s;
		s = this;
		return $internalize(s.Object.backgroundOrigin, $String);
	};
	CSSStyleDeclaration.prototype.BackgroundOrigin = function() { return this.$val.BackgroundOrigin(); };
	CSSStyleDeclaration.ptr.prototype.SetBackgroundOrigin = function(v) {
		var s, v;
		s = this;
		s.Object.backgroundOrigin = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBackgroundOrigin = function(v) { return this.$val.SetBackgroundOrigin(v); };
	CSSStyleDeclaration.ptr.prototype.BackgroundSize = function() {
		var s;
		s = this;
		return $internalize(s.Object.backgroundSize, $String);
	};
	CSSStyleDeclaration.prototype.BackgroundSize = function() { return this.$val.BackgroundSize(); };
	CSSStyleDeclaration.ptr.prototype.SetBackgroundSize = function(v) {
		var s, v;
		s = this;
		s.Object.backgroundSize = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBackgroundSize = function(v) { return this.$val.SetBackgroundSize(v); };
	CSSStyleDeclaration.ptr.prototype.BackfaceVisibility = function() {
		var s;
		s = this;
		return $internalize(s.Object.backfaceVisibility, $String);
	};
	CSSStyleDeclaration.prototype.BackfaceVisibility = function() { return this.$val.BackfaceVisibility(); };
	CSSStyleDeclaration.ptr.prototype.SetBackfaceVisibility = function(v) {
		var s, v;
		s = this;
		s.Object.backfaceVisibility = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBackfaceVisibility = function(v) { return this.$val.SetBackfaceVisibility(v); };
	CSSStyleDeclaration.ptr.prototype.Border = function() {
		var s;
		s = this;
		return $internalize(s.Object.border, $String);
	};
	CSSStyleDeclaration.prototype.Border = function() { return this.$val.Border(); };
	CSSStyleDeclaration.ptr.prototype.SetBorder = function(v) {
		var s, v;
		s = this;
		s.Object.border = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorder = function(v) { return this.$val.SetBorder(v); };
	CSSStyleDeclaration.ptr.prototype.BorderBottom = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderBottom, $String);
	};
	CSSStyleDeclaration.prototype.BorderBottom = function() { return this.$val.BorderBottom(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderBottom = function(v) {
		var s, v;
		s = this;
		s.Object.borderBottom = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderBottom = function(v) { return this.$val.SetBorderBottom(v); };
	CSSStyleDeclaration.ptr.prototype.BorderBottomColor = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderBottomColor, $String);
	};
	CSSStyleDeclaration.prototype.BorderBottomColor = function() { return this.$val.BorderBottomColor(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderBottomColor = function(v) {
		var s, v;
		s = this;
		s.Object.borderBottomColor = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderBottomColor = function(v) { return this.$val.SetBorderBottomColor(v); };
	CSSStyleDeclaration.ptr.prototype.BorderBottomLeftRadius = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderBottomLeftRadius, $String);
	};
	CSSStyleDeclaration.prototype.BorderBottomLeftRadius = function() { return this.$val.BorderBottomLeftRadius(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderBottomLeftRadius = function(v) {
		var s, v;
		s = this;
		s.Object.borderBottomLeftRadius = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderBottomLeftRadius = function(v) { return this.$val.SetBorderBottomLeftRadius(v); };
	CSSStyleDeclaration.ptr.prototype.BorderBottomRightRadius = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderBottomRightRadius, $String);
	};
	CSSStyleDeclaration.prototype.BorderBottomRightRadius = function() { return this.$val.BorderBottomRightRadius(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderBottomRightRadius = function(v) {
		var s, v;
		s = this;
		s.Object.borderBottomRightRadius = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderBottomRightRadius = function(v) { return this.$val.SetBorderBottomRightRadius(v); };
	CSSStyleDeclaration.ptr.prototype.BorderBottomStyle = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderBottomStyle, $String);
	};
	CSSStyleDeclaration.prototype.BorderBottomStyle = function() { return this.$val.BorderBottomStyle(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderBottomStyle = function(v) {
		var s, v;
		s = this;
		s.Object.borderBottomStyle = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderBottomStyle = function(v) { return this.$val.SetBorderBottomStyle(v); };
	CSSStyleDeclaration.ptr.prototype.BorderBottomWidth = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderBottomWidth, $String);
	};
	CSSStyleDeclaration.prototype.BorderBottomWidth = function() { return this.$val.BorderBottomWidth(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderBottomWidth = function(v) {
		var s, v;
		s = this;
		s.Object.borderBottomWidth = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderBottomWidth = function(v) { return this.$val.SetBorderBottomWidth(v); };
	CSSStyleDeclaration.ptr.prototype.BorderCollapse = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderCollapse, $String);
	};
	CSSStyleDeclaration.prototype.BorderCollapse = function() { return this.$val.BorderCollapse(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderCollapse = function(v) {
		var s, v;
		s = this;
		s.Object.borderCollapse = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderCollapse = function(v) { return this.$val.SetBorderCollapse(v); };
	CSSStyleDeclaration.ptr.prototype.BorderColor = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderColor, $String);
	};
	CSSStyleDeclaration.prototype.BorderColor = function() { return this.$val.BorderColor(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderColor = function(v) {
		var s, v;
		s = this;
		s.Object.borderColor = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderColor = function(v) { return this.$val.SetBorderColor(v); };
	CSSStyleDeclaration.ptr.prototype.BorderImage = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderImage, $String);
	};
	CSSStyleDeclaration.prototype.BorderImage = function() { return this.$val.BorderImage(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderImage = function(v) {
		var s, v;
		s = this;
		s.Object.borderImage = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderImage = function(v) { return this.$val.SetBorderImage(v); };
	CSSStyleDeclaration.ptr.prototype.BorderImageOutset = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderImageOutset, $String);
	};
	CSSStyleDeclaration.prototype.BorderImageOutset = function() { return this.$val.BorderImageOutset(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderImageOutset = function(v) {
		var s, v;
		s = this;
		s.Object.borderImageOutset = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderImageOutset = function(v) { return this.$val.SetBorderImageOutset(v); };
	CSSStyleDeclaration.ptr.prototype.BorderImageRepeat = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderImageRepeat, $String);
	};
	CSSStyleDeclaration.prototype.BorderImageRepeat = function() { return this.$val.BorderImageRepeat(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderImageRepeat = function(v) {
		var s, v;
		s = this;
		s.Object.borderImageRepeat = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderImageRepeat = function(v) { return this.$val.SetBorderImageRepeat(v); };
	CSSStyleDeclaration.ptr.prototype.BorderImageSlice = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderImageSlice, $String);
	};
	CSSStyleDeclaration.prototype.BorderImageSlice = function() { return this.$val.BorderImageSlice(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderImageSlice = function(v) {
		var s, v;
		s = this;
		s.Object.borderImageSlice = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderImageSlice = function(v) { return this.$val.SetBorderImageSlice(v); };
	CSSStyleDeclaration.ptr.prototype.BorderImageSource = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderImageSource, $String);
	};
	CSSStyleDeclaration.prototype.BorderImageSource = function() { return this.$val.BorderImageSource(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderImageSource = function(v) {
		var s, v;
		s = this;
		s.Object.borderImageSource = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderImageSource = function(v) { return this.$val.SetBorderImageSource(v); };
	CSSStyleDeclaration.ptr.prototype.BorderImageWidth = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderImageWidth, $String);
	};
	CSSStyleDeclaration.prototype.BorderImageWidth = function() { return this.$val.BorderImageWidth(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderImageWidth = function(v) {
		var s, v;
		s = this;
		s.Object.borderImageWidth = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderImageWidth = function(v) { return this.$val.SetBorderImageWidth(v); };
	CSSStyleDeclaration.ptr.prototype.BorderLeft = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderLeft, $String);
	};
	CSSStyleDeclaration.prototype.BorderLeft = function() { return this.$val.BorderLeft(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderLeft = function(v) {
		var s, v;
		s = this;
		s.Object.borderLeft = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderLeft = function(v) { return this.$val.SetBorderLeft(v); };
	CSSStyleDeclaration.ptr.prototype.BorderLeftColor = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderLeftColor, $String);
	};
	CSSStyleDeclaration.prototype.BorderLeftColor = function() { return this.$val.BorderLeftColor(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderLeftColor = function(v) {
		var s, v;
		s = this;
		s.Object.borderLeftColor = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderLeftColor = function(v) { return this.$val.SetBorderLeftColor(v); };
	CSSStyleDeclaration.ptr.prototype.BorderLeftStyle = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderLeftStyle, $String);
	};
	CSSStyleDeclaration.prototype.BorderLeftStyle = function() { return this.$val.BorderLeftStyle(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderLeftStyle = function(v) {
		var s, v;
		s = this;
		s.Object.borderLeftStyle = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderLeftStyle = function(v) { return this.$val.SetBorderLeftStyle(v); };
	CSSStyleDeclaration.ptr.prototype.BorderLeftWidth = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderLeftWidth, $String);
	};
	CSSStyleDeclaration.prototype.BorderLeftWidth = function() { return this.$val.BorderLeftWidth(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderLeftWidth = function(v) {
		var s, v;
		s = this;
		s.Object.borderLeftWidth = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderLeftWidth = function(v) { return this.$val.SetBorderLeftWidth(v); };
	CSSStyleDeclaration.ptr.prototype.BorderRadius = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderRadius, $String);
	};
	CSSStyleDeclaration.prototype.BorderRadius = function() { return this.$val.BorderRadius(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderRadius = function(v) {
		var s, v;
		s = this;
		s.Object.borderRadius = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderRadius = function(v) { return this.$val.SetBorderRadius(v); };
	CSSStyleDeclaration.ptr.prototype.BorderRight = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderRight, $String);
	};
	CSSStyleDeclaration.prototype.BorderRight = function() { return this.$val.BorderRight(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderRight = function(v) {
		var s, v;
		s = this;
		s.Object.borderRight = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderRight = function(v) { return this.$val.SetBorderRight(v); };
	CSSStyleDeclaration.ptr.prototype.BorderRightColor = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderRightColor, $String);
	};
	CSSStyleDeclaration.prototype.BorderRightColor = function() { return this.$val.BorderRightColor(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderRightColor = function(v) {
		var s, v;
		s = this;
		s.Object.borderRightColor = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderRightColor = function(v) { return this.$val.SetBorderRightColor(v); };
	CSSStyleDeclaration.ptr.prototype.BorderRightStyle = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderRightStyle, $String);
	};
	CSSStyleDeclaration.prototype.BorderRightStyle = function() { return this.$val.BorderRightStyle(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderRightStyle = function(v) {
		var s, v;
		s = this;
		s.Object.borderRightStyle = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderRightStyle = function(v) { return this.$val.SetBorderRightStyle(v); };
	CSSStyleDeclaration.ptr.prototype.BorderRightWidth = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderRightWidth, $String);
	};
	CSSStyleDeclaration.prototype.BorderRightWidth = function() { return this.$val.BorderRightWidth(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderRightWidth = function(v) {
		var s, v;
		s = this;
		s.Object.borderRightWidth = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderRightWidth = function(v) { return this.$val.SetBorderRightWidth(v); };
	CSSStyleDeclaration.ptr.prototype.BorderSpacing = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderSpacing, $String);
	};
	CSSStyleDeclaration.prototype.BorderSpacing = function() { return this.$val.BorderSpacing(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderSpacing = function(v) {
		var s, v;
		s = this;
		s.Object.borderSpacing = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderSpacing = function(v) { return this.$val.SetBorderSpacing(v); };
	CSSStyleDeclaration.ptr.prototype.BorderStyle = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderStyle, $String);
	};
	CSSStyleDeclaration.prototype.BorderStyle = function() { return this.$val.BorderStyle(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderStyle = function(v) {
		var s, v;
		s = this;
		s.Object.borderStyle = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderStyle = function(v) { return this.$val.SetBorderStyle(v); };
	CSSStyleDeclaration.ptr.prototype.BorderTop = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderTop, $String);
	};
	CSSStyleDeclaration.prototype.BorderTop = function() { return this.$val.BorderTop(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderTop = function(v) {
		var s, v;
		s = this;
		s.Object.borderTop = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderTop = function(v) { return this.$val.SetBorderTop(v); };
	CSSStyleDeclaration.ptr.prototype.BorderTopColor = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderTopColor, $String);
	};
	CSSStyleDeclaration.prototype.BorderTopColor = function() { return this.$val.BorderTopColor(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderTopColor = function(v) {
		var s, v;
		s = this;
		s.Object.borderTopColor = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderTopColor = function(v) { return this.$val.SetBorderTopColor(v); };
	CSSStyleDeclaration.ptr.prototype.BorderTopLeftRadius = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderTopLeftRadius, $String);
	};
	CSSStyleDeclaration.prototype.BorderTopLeftRadius = function() { return this.$val.BorderTopLeftRadius(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderTopLeftRadius = function(v) {
		var s, v;
		s = this;
		s.Object.borderTopLeftRadius = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderTopLeftRadius = function(v) { return this.$val.SetBorderTopLeftRadius(v); };
	CSSStyleDeclaration.ptr.prototype.BorderTopRightRadius = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderTopRightRadius, $String);
	};
	CSSStyleDeclaration.prototype.BorderTopRightRadius = function() { return this.$val.BorderTopRightRadius(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderTopRightRadius = function(v) {
		var s, v;
		s = this;
		s.Object.borderTopRightRadius = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderTopRightRadius = function(v) { return this.$val.SetBorderTopRightRadius(v); };
	CSSStyleDeclaration.ptr.prototype.BorderTopStyle = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderTopStyle, $String);
	};
	CSSStyleDeclaration.prototype.BorderTopStyle = function() { return this.$val.BorderTopStyle(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderTopStyle = function(v) {
		var s, v;
		s = this;
		s.Object.borderTopStyle = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderTopStyle = function(v) { return this.$val.SetBorderTopStyle(v); };
	CSSStyleDeclaration.ptr.prototype.BorderTopWidth = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderTopWidth, $String);
	};
	CSSStyleDeclaration.prototype.BorderTopWidth = function() { return this.$val.BorderTopWidth(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderTopWidth = function(v) {
		var s, v;
		s = this;
		s.Object.borderTopWidth = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderTopWidth = function(v) { return this.$val.SetBorderTopWidth(v); };
	CSSStyleDeclaration.ptr.prototype.BorderWidth = function() {
		var s;
		s = this;
		return $internalize(s.Object.borderWidth, $String);
	};
	CSSStyleDeclaration.prototype.BorderWidth = function() { return this.$val.BorderWidth(); };
	CSSStyleDeclaration.ptr.prototype.SetBorderWidth = function(v) {
		var s, v;
		s = this;
		s.Object.borderWidth = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBorderWidth = function(v) { return this.$val.SetBorderWidth(v); };
	CSSStyleDeclaration.ptr.prototype.Bottom = function() {
		var s;
		s = this;
		return $internalize(s.Object.bottom, $String);
	};
	CSSStyleDeclaration.prototype.Bottom = function() { return this.$val.Bottom(); };
	CSSStyleDeclaration.ptr.prototype.SetBottom = function(v) {
		var s, v;
		s = this;
		s.Object.bottom = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBottom = function(v) { return this.$val.SetBottom(v); };
	CSSStyleDeclaration.ptr.prototype.BoxShadow = function() {
		var s;
		s = this;
		return $internalize(s.Object.boxShadow, $String);
	};
	CSSStyleDeclaration.prototype.BoxShadow = function() { return this.$val.BoxShadow(); };
	CSSStyleDeclaration.ptr.prototype.SetBoxShadow = function(v) {
		var s, v;
		s = this;
		s.Object.boxShadow = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBoxShadow = function(v) { return this.$val.SetBoxShadow(v); };
	CSSStyleDeclaration.ptr.prototype.BoxSizing = function() {
		var s;
		s = this;
		return $internalize(s.Object.boxSizing, $String);
	};
	CSSStyleDeclaration.prototype.BoxSizing = function() { return this.$val.BoxSizing(); };
	CSSStyleDeclaration.ptr.prototype.SetBoxSizing = function(v) {
		var s, v;
		s = this;
		s.Object.boxSizing = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetBoxSizing = function(v) { return this.$val.SetBoxSizing(v); };
	CSSStyleDeclaration.ptr.prototype.CaptionSide = function() {
		var s;
		s = this;
		return $internalize(s.Object.captionSide, $String);
	};
	CSSStyleDeclaration.prototype.CaptionSide = function() { return this.$val.CaptionSide(); };
	CSSStyleDeclaration.ptr.prototype.SetCaptionSide = function(v) {
		var s, v;
		s = this;
		s.Object.captionSide = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetCaptionSide = function(v) { return this.$val.SetCaptionSide(v); };
	CSSStyleDeclaration.ptr.prototype.Clear = function() {
		var s;
		s = this;
		return $internalize(s.Object.clear, $String);
	};
	CSSStyleDeclaration.prototype.Clear = function() { return this.$val.Clear(); };
	CSSStyleDeclaration.ptr.prototype.SetClear = function(v) {
		var s, v;
		s = this;
		s.Object.clear = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetClear = function(v) { return this.$val.SetClear(v); };
	CSSStyleDeclaration.ptr.prototype.Clip = function() {
		var s;
		s = this;
		return $internalize(s.Object.clip, $String);
	};
	CSSStyleDeclaration.prototype.Clip = function() { return this.$val.Clip(); };
	CSSStyleDeclaration.ptr.prototype.SetClip = function(v) {
		var s, v;
		s = this;
		s.Object.clip = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetClip = function(v) { return this.$val.SetClip(v); };
	CSSStyleDeclaration.ptr.prototype.Color = function() {
		var s;
		s = this;
		return $internalize(s.Object.color, $String);
	};
	CSSStyleDeclaration.prototype.Color = function() { return this.$val.Color(); };
	CSSStyleDeclaration.ptr.prototype.SetColor = function(v) {
		var s, v;
		s = this;
		s.Object.color = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetColor = function(v) { return this.$val.SetColor(v); };
	CSSStyleDeclaration.ptr.prototype.ColumnCount = function() {
		var s;
		s = this;
		return $internalize(s.Object.columnCount, $String);
	};
	CSSStyleDeclaration.prototype.ColumnCount = function() { return this.$val.ColumnCount(); };
	CSSStyleDeclaration.ptr.prototype.SetColumnCount = function(v) {
		var s, v;
		s = this;
		s.Object.columnCount = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetColumnCount = function(v) { return this.$val.SetColumnCount(v); };
	CSSStyleDeclaration.ptr.prototype.ColumnFill = function() {
		var s;
		s = this;
		return $internalize(s.Object.columnFill, $String);
	};
	CSSStyleDeclaration.prototype.ColumnFill = function() { return this.$val.ColumnFill(); };
	CSSStyleDeclaration.ptr.prototype.SetColumnFill = function(v) {
		var s, v;
		s = this;
		s.Object.columnFill = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetColumnFill = function(v) { return this.$val.SetColumnFill(v); };
	CSSStyleDeclaration.ptr.prototype.ColumnGap = function() {
		var s;
		s = this;
		return $internalize(s.Object.columnGap, $String);
	};
	CSSStyleDeclaration.prototype.ColumnGap = function() { return this.$val.ColumnGap(); };
	CSSStyleDeclaration.ptr.prototype.SetColumnGap = function(v) {
		var s, v;
		s = this;
		s.Object.columnGap = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetColumnGap = function(v) { return this.$val.SetColumnGap(v); };
	CSSStyleDeclaration.ptr.prototype.ColumnRule = function() {
		var s;
		s = this;
		return $internalize(s.Object.columnRule, $String);
	};
	CSSStyleDeclaration.prototype.ColumnRule = function() { return this.$val.ColumnRule(); };
	CSSStyleDeclaration.ptr.prototype.SetColumnRule = function(v) {
		var s, v;
		s = this;
		s.Object.columnRule = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetColumnRule = function(v) { return this.$val.SetColumnRule(v); };
	CSSStyleDeclaration.ptr.prototype.ColumnRuleColor = function() {
		var s;
		s = this;
		return $internalize(s.Object.columnRuleColor, $String);
	};
	CSSStyleDeclaration.prototype.ColumnRuleColor = function() { return this.$val.ColumnRuleColor(); };
	CSSStyleDeclaration.ptr.prototype.SetColumnRuleColor = function(v) {
		var s, v;
		s = this;
		s.Object.columnRuleColor = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetColumnRuleColor = function(v) { return this.$val.SetColumnRuleColor(v); };
	CSSStyleDeclaration.ptr.prototype.ColumnRuleStyle = function() {
		var s;
		s = this;
		return $internalize(s.Object.columnRuleStyle, $String);
	};
	CSSStyleDeclaration.prototype.ColumnRuleStyle = function() { return this.$val.ColumnRuleStyle(); };
	CSSStyleDeclaration.ptr.prototype.SetColumnRuleStyle = function(v) {
		var s, v;
		s = this;
		s.Object.columnRuleStyle = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetColumnRuleStyle = function(v) { return this.$val.SetColumnRuleStyle(v); };
	CSSStyleDeclaration.ptr.prototype.ColumnRuleWidth = function() {
		var s;
		s = this;
		return $internalize(s.Object.columnRuleWidth, $String);
	};
	CSSStyleDeclaration.prototype.ColumnRuleWidth = function() { return this.$val.ColumnRuleWidth(); };
	CSSStyleDeclaration.ptr.prototype.SetColumnRuleWidth = function(v) {
		var s, v;
		s = this;
		s.Object.columnRuleWidth = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetColumnRuleWidth = function(v) { return this.$val.SetColumnRuleWidth(v); };
	CSSStyleDeclaration.ptr.prototype.Columns = function() {
		var s;
		s = this;
		return $internalize(s.Object.columns, $String);
	};
	CSSStyleDeclaration.prototype.Columns = function() { return this.$val.Columns(); };
	CSSStyleDeclaration.ptr.prototype.SetColumns = function(v) {
		var s, v;
		s = this;
		s.Object.columns = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetColumns = function(v) { return this.$val.SetColumns(v); };
	CSSStyleDeclaration.ptr.prototype.ColumnSpan = function() {
		var s;
		s = this;
		return $internalize(s.Object.columnSpan, $String);
	};
	CSSStyleDeclaration.prototype.ColumnSpan = function() { return this.$val.ColumnSpan(); };
	CSSStyleDeclaration.ptr.prototype.SetColumnSpan = function(v) {
		var s, v;
		s = this;
		s.Object.columnSpan = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetColumnSpan = function(v) { return this.$val.SetColumnSpan(v); };
	CSSStyleDeclaration.ptr.prototype.ColumnWidth = function() {
		var s;
		s = this;
		return $internalize(s.Object.columnWidth, $String);
	};
	CSSStyleDeclaration.prototype.ColumnWidth = function() { return this.$val.ColumnWidth(); };
	CSSStyleDeclaration.ptr.prototype.SetColumnWidth = function(v) {
		var s, v;
		s = this;
		s.Object.columnWidth = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetColumnWidth = function(v) { return this.$val.SetColumnWidth(v); };
	CSSStyleDeclaration.ptr.prototype.CounterIncrement = function() {
		var s;
		s = this;
		return $internalize(s.Object.counterIncrement, $String);
	};
	CSSStyleDeclaration.prototype.CounterIncrement = function() { return this.$val.CounterIncrement(); };
	CSSStyleDeclaration.ptr.prototype.SetCounterIncrement = function(v) {
		var s, v;
		s = this;
		s.Object.counterIncrement = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetCounterIncrement = function(v) { return this.$val.SetCounterIncrement(v); };
	CSSStyleDeclaration.ptr.prototype.CounterReset = function() {
		var s;
		s = this;
		return $internalize(s.Object.counterReset, $String);
	};
	CSSStyleDeclaration.prototype.CounterReset = function() { return this.$val.CounterReset(); };
	CSSStyleDeclaration.ptr.prototype.SetCounterReset = function(v) {
		var s, v;
		s = this;
		s.Object.counterReset = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetCounterReset = function(v) { return this.$val.SetCounterReset(v); };
	CSSStyleDeclaration.ptr.prototype.Cursor = function() {
		var s;
		s = this;
		return $internalize(s.Object.cursor, $String);
	};
	CSSStyleDeclaration.prototype.Cursor = function() { return this.$val.Cursor(); };
	CSSStyleDeclaration.ptr.prototype.SetCursor = function(v) {
		var s, v;
		s = this;
		s.Object.cursor = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetCursor = function(v) { return this.$val.SetCursor(v); };
	CSSStyleDeclaration.ptr.prototype.Direction = function() {
		var s;
		s = this;
		return $internalize(s.Object.direction, $String);
	};
	CSSStyleDeclaration.prototype.Direction = function() { return this.$val.Direction(); };
	CSSStyleDeclaration.ptr.prototype.SetDirection = function(v) {
		var s, v;
		s = this;
		s.Object.direction = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetDirection = function(v) { return this.$val.SetDirection(v); };
	CSSStyleDeclaration.ptr.prototype.Display = function() {
		var s;
		s = this;
		return $internalize(s.Object.display, $String);
	};
	CSSStyleDeclaration.prototype.Display = function() { return this.$val.Display(); };
	CSSStyleDeclaration.ptr.prototype.SetDisplay = function(v) {
		var s, v;
		s = this;
		s.Object.display = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetDisplay = function(v) { return this.$val.SetDisplay(v); };
	CSSStyleDeclaration.ptr.prototype.EmptyCells = function() {
		var s;
		s = this;
		return $internalize(s.Object.emptyCells, $String);
	};
	CSSStyleDeclaration.prototype.EmptyCells = function() { return this.$val.EmptyCells(); };
	CSSStyleDeclaration.ptr.prototype.SetEmptyCells = function(v) {
		var s, v;
		s = this;
		s.Object.emptyCells = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetEmptyCells = function(v) { return this.$val.SetEmptyCells(v); };
	CSSStyleDeclaration.ptr.prototype.Filter = function() {
		var s;
		s = this;
		return $internalize(s.Object.filter, $String);
	};
	CSSStyleDeclaration.prototype.Filter = function() { return this.$val.Filter(); };
	CSSStyleDeclaration.ptr.prototype.SetFilter = function(v) {
		var s, v;
		s = this;
		s.Object.filter = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFilter = function(v) { return this.$val.SetFilter(v); };
	CSSStyleDeclaration.ptr.prototype.Flex = function() {
		var s;
		s = this;
		return $internalize(s.Object.flex, $String);
	};
	CSSStyleDeclaration.prototype.Flex = function() { return this.$val.Flex(); };
	CSSStyleDeclaration.ptr.prototype.SetFlex = function(v) {
		var s, v;
		s = this;
		s.Object.flex = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFlex = function(v) { return this.$val.SetFlex(v); };
	CSSStyleDeclaration.ptr.prototype.FlexBasis = function() {
		var s;
		s = this;
		return $internalize(s.Object.flexBasis, $String);
	};
	CSSStyleDeclaration.prototype.FlexBasis = function() { return this.$val.FlexBasis(); };
	CSSStyleDeclaration.ptr.prototype.SetFlexBasis = function(v) {
		var s, v;
		s = this;
		s.Object.flexBasis = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFlexBasis = function(v) { return this.$val.SetFlexBasis(v); };
	CSSStyleDeclaration.ptr.prototype.FlexDirection = function() {
		var s;
		s = this;
		return $internalize(s.Object.flexDirection, $String);
	};
	CSSStyleDeclaration.prototype.FlexDirection = function() { return this.$val.FlexDirection(); };
	CSSStyleDeclaration.ptr.prototype.SetFlexDirection = function(v) {
		var s, v;
		s = this;
		s.Object.flexDirection = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFlexDirection = function(v) { return this.$val.SetFlexDirection(v); };
	CSSStyleDeclaration.ptr.prototype.FlexFlow = function() {
		var s;
		s = this;
		return $internalize(s.Object.flexFlow, $String);
	};
	CSSStyleDeclaration.prototype.FlexFlow = function() { return this.$val.FlexFlow(); };
	CSSStyleDeclaration.ptr.prototype.SetFlexFlow = function(v) {
		var s, v;
		s = this;
		s.Object.flexFlow = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFlexFlow = function(v) { return this.$val.SetFlexFlow(v); };
	CSSStyleDeclaration.ptr.prototype.FlexGrow = function() {
		var s;
		s = this;
		return $internalize(s.Object.flexGrow, $String);
	};
	CSSStyleDeclaration.prototype.FlexGrow = function() { return this.$val.FlexGrow(); };
	CSSStyleDeclaration.ptr.prototype.SetFlexGrow = function(v) {
		var s, v;
		s = this;
		s.Object.flexGrow = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFlexGrow = function(v) { return this.$val.SetFlexGrow(v); };
	CSSStyleDeclaration.ptr.prototype.FlexShrink = function() {
		var s;
		s = this;
		return $internalize(s.Object.flexShrink, $String);
	};
	CSSStyleDeclaration.prototype.FlexShrink = function() { return this.$val.FlexShrink(); };
	CSSStyleDeclaration.ptr.prototype.SetFlexShrink = function(v) {
		var s, v;
		s = this;
		s.Object.flexShrink = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFlexShrink = function(v) { return this.$val.SetFlexShrink(v); };
	CSSStyleDeclaration.ptr.prototype.FlexWrap = function() {
		var s;
		s = this;
		return $internalize(s.Object.flexWrap, $String);
	};
	CSSStyleDeclaration.prototype.FlexWrap = function() { return this.$val.FlexWrap(); };
	CSSStyleDeclaration.ptr.prototype.SetFlexWrap = function(v) {
		var s, v;
		s = this;
		s.Object.flexWrap = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFlexWrap = function(v) { return this.$val.SetFlexWrap(v); };
	CSSStyleDeclaration.ptr.prototype.CssFloat = function() {
		var s;
		s = this;
		return $internalize(s.Object.cssFloat, $String);
	};
	CSSStyleDeclaration.prototype.CssFloat = function() { return this.$val.CssFloat(); };
	CSSStyleDeclaration.ptr.prototype.SetCssFloat = function(v) {
		var s, v;
		s = this;
		s.Object.cssFloat = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetCssFloat = function(v) { return this.$val.SetCssFloat(v); };
	CSSStyleDeclaration.ptr.prototype.Font = function() {
		var s;
		s = this;
		return $internalize(s.Object.font, $String);
	};
	CSSStyleDeclaration.prototype.Font = function() { return this.$val.Font(); };
	CSSStyleDeclaration.ptr.prototype.SetFont = function(v) {
		var s, v;
		s = this;
		s.Object.font = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFont = function(v) { return this.$val.SetFont(v); };
	CSSStyleDeclaration.ptr.prototype.FontFamily = function() {
		var s;
		s = this;
		return $internalize(s.Object.fontFamily, $String);
	};
	CSSStyleDeclaration.prototype.FontFamily = function() { return this.$val.FontFamily(); };
	CSSStyleDeclaration.ptr.prototype.SetFontFamily = function(v) {
		var s, v;
		s = this;
		s.Object.fontFamily = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFontFamily = function(v) { return this.$val.SetFontFamily(v); };
	CSSStyleDeclaration.ptr.prototype.FontSize = function() {
		var s;
		s = this;
		return $internalize(s.Object.fontSize, $String);
	};
	CSSStyleDeclaration.prototype.FontSize = function() { return this.$val.FontSize(); };
	CSSStyleDeclaration.ptr.prototype.SetFontSize = function(v) {
		var s, v;
		s = this;
		s.Object.fontSize = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFontSize = function(v) { return this.$val.SetFontSize(v); };
	CSSStyleDeclaration.ptr.prototype.FontStyle = function() {
		var s;
		s = this;
		return $internalize(s.Object.fontStyle, $String);
	};
	CSSStyleDeclaration.prototype.FontStyle = function() { return this.$val.FontStyle(); };
	CSSStyleDeclaration.ptr.prototype.SetFontStyle = function(v) {
		var s, v;
		s = this;
		s.Object.fontStyle = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFontStyle = function(v) { return this.$val.SetFontStyle(v); };
	CSSStyleDeclaration.ptr.prototype.FontVariant = function() {
		var s;
		s = this;
		return $internalize(s.Object.fontVariant, $String);
	};
	CSSStyleDeclaration.prototype.FontVariant = function() { return this.$val.FontVariant(); };
	CSSStyleDeclaration.ptr.prototype.SetFontVariant = function(v) {
		var s, v;
		s = this;
		s.Object.fontVariant = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFontVariant = function(v) { return this.$val.SetFontVariant(v); };
	CSSStyleDeclaration.ptr.prototype.FontWeight = function() {
		var s;
		s = this;
		return $internalize(s.Object.fontWeight, $String);
	};
	CSSStyleDeclaration.prototype.FontWeight = function() { return this.$val.FontWeight(); };
	CSSStyleDeclaration.ptr.prototype.SetFontWeight = function(v) {
		var s, v;
		s = this;
		s.Object.fontWeight = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFontWeight = function(v) { return this.$val.SetFontWeight(v); };
	CSSStyleDeclaration.ptr.prototype.FontSizeAdjust = function() {
		var s;
		s = this;
		return $internalize(s.Object.fontSizeAdjust, $String);
	};
	CSSStyleDeclaration.prototype.FontSizeAdjust = function() { return this.$val.FontSizeAdjust(); };
	CSSStyleDeclaration.ptr.prototype.SetFontSizeAdjust = function(v) {
		var s, v;
		s = this;
		s.Object.fontSizeAdjust = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetFontSizeAdjust = function(v) { return this.$val.SetFontSizeAdjust(v); };
	CSSStyleDeclaration.ptr.prototype.Height = function() {
		var s;
		s = this;
		return $internalize(s.Object.height, $String);
	};
	CSSStyleDeclaration.prototype.Height = function() { return this.$val.Height(); };
	CSSStyleDeclaration.ptr.prototype.SetHeight = function(v) {
		var s, v;
		s = this;
		s.Object.height = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetHeight = function(v) { return this.$val.SetHeight(v); };
	CSSStyleDeclaration.ptr.prototype.JustifyContent = function() {
		var s;
		s = this;
		return $internalize(s.Object.justifyContent, $String);
	};
	CSSStyleDeclaration.prototype.JustifyContent = function() { return this.$val.JustifyContent(); };
	CSSStyleDeclaration.ptr.prototype.SetJustifyContent = function(v) {
		var s, v;
		s = this;
		s.Object.justifyContent = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetJustifyContent = function(v) { return this.$val.SetJustifyContent(v); };
	CSSStyleDeclaration.ptr.prototype.Left = function() {
		var s;
		s = this;
		return $internalize(s.Object.left, $String);
	};
	CSSStyleDeclaration.prototype.Left = function() { return this.$val.Left(); };
	CSSStyleDeclaration.ptr.prototype.SetLeft = function(v) {
		var s, v;
		s = this;
		s.Object.left = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetLeft = function(v) { return this.$val.SetLeft(v); };
	CSSStyleDeclaration.ptr.prototype.LetterSpacing = function() {
		var s;
		s = this;
		return $internalize(s.Object.letterSpacing, $String);
	};
	CSSStyleDeclaration.prototype.LetterSpacing = function() { return this.$val.LetterSpacing(); };
	CSSStyleDeclaration.ptr.prototype.SetLetterSpacing = function(v) {
		var s, v;
		s = this;
		s.Object.letterSpacing = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetLetterSpacing = function(v) { return this.$val.SetLetterSpacing(v); };
	CSSStyleDeclaration.ptr.prototype.LineHeight = function() {
		var s;
		s = this;
		return $internalize(s.Object.lineHeight, $String);
	};
	CSSStyleDeclaration.prototype.LineHeight = function() { return this.$val.LineHeight(); };
	CSSStyleDeclaration.ptr.prototype.SetLineHeight = function(v) {
		var s, v;
		s = this;
		s.Object.lineHeight = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetLineHeight = function(v) { return this.$val.SetLineHeight(v); };
	CSSStyleDeclaration.ptr.prototype.ListStyle = function() {
		var s;
		s = this;
		return $internalize(s.Object.listStyle, $String);
	};
	CSSStyleDeclaration.prototype.ListStyle = function() { return this.$val.ListStyle(); };
	CSSStyleDeclaration.ptr.prototype.SetListStyle = function(v) {
		var s, v;
		s = this;
		s.Object.listStyle = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetListStyle = function(v) { return this.$val.SetListStyle(v); };
	CSSStyleDeclaration.ptr.prototype.ListStyleImage = function() {
		var s;
		s = this;
		return $internalize(s.Object.listStyleImage, $String);
	};
	CSSStyleDeclaration.prototype.ListStyleImage = function() { return this.$val.ListStyleImage(); };
	CSSStyleDeclaration.ptr.prototype.SetListStyleImage = function(v) {
		var s, v;
		s = this;
		s.Object.listStyleImage = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetListStyleImage = function(v) { return this.$val.SetListStyleImage(v); };
	CSSStyleDeclaration.ptr.prototype.ListStylePosition = function() {
		var s;
		s = this;
		return $internalize(s.Object.listStylePosition, $String);
	};
	CSSStyleDeclaration.prototype.ListStylePosition = function() { return this.$val.ListStylePosition(); };
	CSSStyleDeclaration.ptr.prototype.SetListStylePosition = function(v) {
		var s, v;
		s = this;
		s.Object.listStylePosition = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetListStylePosition = function(v) { return this.$val.SetListStylePosition(v); };
	CSSStyleDeclaration.ptr.prototype.ListStyleType = function() {
		var s;
		s = this;
		return $internalize(s.Object.listStyleType, $String);
	};
	CSSStyleDeclaration.prototype.ListStyleType = function() { return this.$val.ListStyleType(); };
	CSSStyleDeclaration.ptr.prototype.SetListStyleType = function(v) {
		var s, v;
		s = this;
		s.Object.listStyleType = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetListStyleType = function(v) { return this.$val.SetListStyleType(v); };
	CSSStyleDeclaration.ptr.prototype.Margin = function() {
		var s;
		s = this;
		return $internalize(s.Object.margin, $String);
	};
	CSSStyleDeclaration.prototype.Margin = function() { return this.$val.Margin(); };
	CSSStyleDeclaration.ptr.prototype.SetMargin = function(v) {
		var s, v;
		s = this;
		s.Object.margin = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetMargin = function(v) { return this.$val.SetMargin(v); };
	CSSStyleDeclaration.ptr.prototype.MarginBottom = function() {
		var s;
		s = this;
		return $internalize(s.Object.marginBottom, $String);
	};
	CSSStyleDeclaration.prototype.MarginBottom = function() { return this.$val.MarginBottom(); };
	CSSStyleDeclaration.ptr.prototype.SetMarginBottom = function(v) {
		var s, v;
		s = this;
		s.Object.marginBottom = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetMarginBottom = function(v) { return this.$val.SetMarginBottom(v); };
	CSSStyleDeclaration.ptr.prototype.MarginLeft = function() {
		var s;
		s = this;
		return $internalize(s.Object.marginLeft, $String);
	};
	CSSStyleDeclaration.prototype.MarginLeft = function() { return this.$val.MarginLeft(); };
	CSSStyleDeclaration.ptr.prototype.SetMarginLeft = function(v) {
		var s, v;
		s = this;
		s.Object.marginLeft = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetMarginLeft = function(v) { return this.$val.SetMarginLeft(v); };
	CSSStyleDeclaration.ptr.prototype.MarginRight = function() {
		var s;
		s = this;
		return $internalize(s.Object.marginRight, $String);
	};
	CSSStyleDeclaration.prototype.MarginRight = function() { return this.$val.MarginRight(); };
	CSSStyleDeclaration.ptr.prototype.SetMarginRight = function(v) {
		var s, v;
		s = this;
		s.Object.marginRight = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetMarginRight = function(v) { return this.$val.SetMarginRight(v); };
	CSSStyleDeclaration.ptr.prototype.MarginTop = function() {
		var s;
		s = this;
		return $internalize(s.Object.marginTop, $String);
	};
	CSSStyleDeclaration.prototype.MarginTop = function() { return this.$val.MarginTop(); };
	CSSStyleDeclaration.ptr.prototype.SetMarginTop = function(v) {
		var s, v;
		s = this;
		s.Object.marginTop = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetMarginTop = function(v) { return this.$val.SetMarginTop(v); };
	CSSStyleDeclaration.ptr.prototype.MaxHeight = function() {
		var s;
		s = this;
		return $internalize(s.Object.maxHeight, $String);
	};
	CSSStyleDeclaration.prototype.MaxHeight = function() { return this.$val.MaxHeight(); };
	CSSStyleDeclaration.ptr.prototype.SetMaxHeight = function(v) {
		var s, v;
		s = this;
		s.Object.maxHeight = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetMaxHeight = function(v) { return this.$val.SetMaxHeight(v); };
	CSSStyleDeclaration.ptr.prototype.MaxWidth = function() {
		var s;
		s = this;
		return $internalize(s.Object.maxWidth, $String);
	};
	CSSStyleDeclaration.prototype.MaxWidth = function() { return this.$val.MaxWidth(); };
	CSSStyleDeclaration.ptr.prototype.SetMaxWidth = function(v) {
		var s, v;
		s = this;
		s.Object.maxWidth = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetMaxWidth = function(v) { return this.$val.SetMaxWidth(v); };
	CSSStyleDeclaration.ptr.prototype.MinHeight = function() {
		var s;
		s = this;
		return $internalize(s.Object.minHeight, $String);
	};
	CSSStyleDeclaration.prototype.MinHeight = function() { return this.$val.MinHeight(); };
	CSSStyleDeclaration.ptr.prototype.SetMinHeight = function(v) {
		var s, v;
		s = this;
		s.Object.minHeight = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetMinHeight = function(v) { return this.$val.SetMinHeight(v); };
	CSSStyleDeclaration.ptr.prototype.MinWidth = function() {
		var s;
		s = this;
		return $internalize(s.Object.minWidth, $String);
	};
	CSSStyleDeclaration.prototype.MinWidth = function() { return this.$val.MinWidth(); };
	CSSStyleDeclaration.ptr.prototype.SetMinWidth = function(v) {
		var s, v;
		s = this;
		s.Object.minWidth = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetMinWidth = function(v) { return this.$val.SetMinWidth(v); };
	CSSStyleDeclaration.ptr.prototype.Opacity = function() {
		var s;
		s = this;
		return $internalize(s.Object.opacity, $String);
	};
	CSSStyleDeclaration.prototype.Opacity = function() { return this.$val.Opacity(); };
	CSSStyleDeclaration.ptr.prototype.SetOpacity = function(v) {
		var s, v;
		s = this;
		s.Object.opacity = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetOpacity = function(v) { return this.$val.SetOpacity(v); };
	CSSStyleDeclaration.ptr.prototype.Order = function() {
		var s;
		s = this;
		return $internalize(s.Object.order, $String);
	};
	CSSStyleDeclaration.prototype.Order = function() { return this.$val.Order(); };
	CSSStyleDeclaration.ptr.prototype.SetOrder = function(v) {
		var s, v;
		s = this;
		s.Object.order = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetOrder = function(v) { return this.$val.SetOrder(v); };
	CSSStyleDeclaration.ptr.prototype.Orphans = function() {
		var s;
		s = this;
		return $internalize(s.Object.orphans, $String);
	};
	CSSStyleDeclaration.prototype.Orphans = function() { return this.$val.Orphans(); };
	CSSStyleDeclaration.ptr.prototype.SetOrphans = function(v) {
		var s, v;
		s = this;
		s.Object.orphans = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetOrphans = function(v) { return this.$val.SetOrphans(v); };
	CSSStyleDeclaration.ptr.prototype.Outline = function() {
		var s;
		s = this;
		return $internalize(s.Object.outline, $String);
	};
	CSSStyleDeclaration.prototype.Outline = function() { return this.$val.Outline(); };
	CSSStyleDeclaration.ptr.prototype.SetOutline = function(v) {
		var s, v;
		s = this;
		s.Object.outline = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetOutline = function(v) { return this.$val.SetOutline(v); };
	CSSStyleDeclaration.ptr.prototype.OutlineColor = function() {
		var s;
		s = this;
		return $internalize(s.Object.outlineColor, $String);
	};
	CSSStyleDeclaration.prototype.OutlineColor = function() { return this.$val.OutlineColor(); };
	CSSStyleDeclaration.ptr.prototype.SetOutlineColor = function(v) {
		var s, v;
		s = this;
		s.Object.outlineColor = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetOutlineColor = function(v) { return this.$val.SetOutlineColor(v); };
	CSSStyleDeclaration.ptr.prototype.OutlineOffset = function() {
		var s;
		s = this;
		return $internalize(s.Object.outlineOffset, $String);
	};
	CSSStyleDeclaration.prototype.OutlineOffset = function() { return this.$val.OutlineOffset(); };
	CSSStyleDeclaration.ptr.prototype.SetOutlineOffset = function(v) {
		var s, v;
		s = this;
		s.Object.outlineOffset = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetOutlineOffset = function(v) { return this.$val.SetOutlineOffset(v); };
	CSSStyleDeclaration.ptr.prototype.OutlineStyle = function() {
		var s;
		s = this;
		return $internalize(s.Object.outlineStyle, $String);
	};
	CSSStyleDeclaration.prototype.OutlineStyle = function() { return this.$val.OutlineStyle(); };
	CSSStyleDeclaration.ptr.prototype.SetOutlineStyle = function(v) {
		var s, v;
		s = this;
		s.Object.outlineStyle = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetOutlineStyle = function(v) { return this.$val.SetOutlineStyle(v); };
	CSSStyleDeclaration.ptr.prototype.OutlineWidth = function() {
		var s;
		s = this;
		return $internalize(s.Object.outlineWidth, $String);
	};
	CSSStyleDeclaration.prototype.OutlineWidth = function() { return this.$val.OutlineWidth(); };
	CSSStyleDeclaration.ptr.prototype.SetOutlineWidth = function(v) {
		var s, v;
		s = this;
		s.Object.outlineWidth = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetOutlineWidth = function(v) { return this.$val.SetOutlineWidth(v); };
	CSSStyleDeclaration.ptr.prototype.Overflow = function() {
		var s;
		s = this;
		return $internalize(s.Object.overflow, $String);
	};
	CSSStyleDeclaration.prototype.Overflow = function() { return this.$val.Overflow(); };
	CSSStyleDeclaration.ptr.prototype.SetOverflow = function(v) {
		var s, v;
		s = this;
		s.Object.overflow = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetOverflow = function(v) { return this.$val.SetOverflow(v); };
	CSSStyleDeclaration.ptr.prototype.OverflowX = function() {
		var s;
		s = this;
		return $internalize(s.Object.overflowX, $String);
	};
	CSSStyleDeclaration.prototype.OverflowX = function() { return this.$val.OverflowX(); };
	CSSStyleDeclaration.ptr.prototype.SetOverflowX = function(v) {
		var s, v;
		s = this;
		s.Object.overflowX = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetOverflowX = function(v) { return this.$val.SetOverflowX(v); };
	CSSStyleDeclaration.ptr.prototype.OverflowY = function() {
		var s;
		s = this;
		return $internalize(s.Object.overflowY, $String);
	};
	CSSStyleDeclaration.prototype.OverflowY = function() { return this.$val.OverflowY(); };
	CSSStyleDeclaration.ptr.prototype.SetOverflowY = function(v) {
		var s, v;
		s = this;
		s.Object.overflowY = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetOverflowY = function(v) { return this.$val.SetOverflowY(v); };
	CSSStyleDeclaration.ptr.prototype.Padding = function() {
		var s;
		s = this;
		return $internalize(s.Object.padding, $String);
	};
	CSSStyleDeclaration.prototype.Padding = function() { return this.$val.Padding(); };
	CSSStyleDeclaration.ptr.prototype.SetPadding = function(v) {
		var s, v;
		s = this;
		s.Object.padding = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetPadding = function(v) { return this.$val.SetPadding(v); };
	CSSStyleDeclaration.ptr.prototype.PaddingBottom = function() {
		var s;
		s = this;
		return $internalize(s.Object.paddingBottom, $String);
	};
	CSSStyleDeclaration.prototype.PaddingBottom = function() { return this.$val.PaddingBottom(); };
	CSSStyleDeclaration.ptr.prototype.SetPaddingBottom = function(v) {
		var s, v;
		s = this;
		s.Object.paddingBottom = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetPaddingBottom = function(v) { return this.$val.SetPaddingBottom(v); };
	CSSStyleDeclaration.ptr.prototype.PaddingLeft = function() {
		var s;
		s = this;
		return $internalize(s.Object.paddingLeft, $String);
	};
	CSSStyleDeclaration.prototype.PaddingLeft = function() { return this.$val.PaddingLeft(); };
	CSSStyleDeclaration.ptr.prototype.SetPaddingLeft = function(v) {
		var s, v;
		s = this;
		s.Object.paddingLeft = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetPaddingLeft = function(v) { return this.$val.SetPaddingLeft(v); };
	CSSStyleDeclaration.ptr.prototype.PaddingRight = function() {
		var s;
		s = this;
		return $internalize(s.Object.paddingRight, $String);
	};
	CSSStyleDeclaration.prototype.PaddingRight = function() { return this.$val.PaddingRight(); };
	CSSStyleDeclaration.ptr.prototype.SetPaddingRight = function(v) {
		var s, v;
		s = this;
		s.Object.paddingRight = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetPaddingRight = function(v) { return this.$val.SetPaddingRight(v); };
	CSSStyleDeclaration.ptr.prototype.PaddingTop = function() {
		var s;
		s = this;
		return $internalize(s.Object.paddingTop, $String);
	};
	CSSStyleDeclaration.prototype.PaddingTop = function() { return this.$val.PaddingTop(); };
	CSSStyleDeclaration.ptr.prototype.SetPaddingTop = function(v) {
		var s, v;
		s = this;
		s.Object.paddingTop = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetPaddingTop = function(v) { return this.$val.SetPaddingTop(v); };
	CSSStyleDeclaration.ptr.prototype.PageBreakAfter = function() {
		var s;
		s = this;
		return $internalize(s.Object.pageBreakAfter, $String);
	};
	CSSStyleDeclaration.prototype.PageBreakAfter = function() { return this.$val.PageBreakAfter(); };
	CSSStyleDeclaration.ptr.prototype.SetPageBreakAfter = function(v) {
		var s, v;
		s = this;
		s.Object.pageBreakAfter = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetPageBreakAfter = function(v) { return this.$val.SetPageBreakAfter(v); };
	CSSStyleDeclaration.ptr.prototype.PageBreakBefore = function() {
		var s;
		s = this;
		return $internalize(s.Object.pageBreakBefore, $String);
	};
	CSSStyleDeclaration.prototype.PageBreakBefore = function() { return this.$val.PageBreakBefore(); };
	CSSStyleDeclaration.ptr.prototype.SetPageBreakBefore = function(v) {
		var s, v;
		s = this;
		s.Object.pageBreakBefore = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetPageBreakBefore = function(v) { return this.$val.SetPageBreakBefore(v); };
	CSSStyleDeclaration.ptr.prototype.PageBreakInside = function() {
		var s;
		s = this;
		return $internalize(s.Object.pageBreakInside, $String);
	};
	CSSStyleDeclaration.prototype.PageBreakInside = function() { return this.$val.PageBreakInside(); };
	CSSStyleDeclaration.ptr.prototype.SetPageBreakInside = function(v) {
		var s, v;
		s = this;
		s.Object.pageBreakInside = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetPageBreakInside = function(v) { return this.$val.SetPageBreakInside(v); };
	CSSStyleDeclaration.ptr.prototype.Perspective = function() {
		var s;
		s = this;
		return $internalize(s.Object.perspective, $String);
	};
	CSSStyleDeclaration.prototype.Perspective = function() { return this.$val.Perspective(); };
	CSSStyleDeclaration.ptr.prototype.SetPerspective = function(v) {
		var s, v;
		s = this;
		s.Object.perspective = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetPerspective = function(v) { return this.$val.SetPerspective(v); };
	CSSStyleDeclaration.ptr.prototype.PerspectiveOrigin = function() {
		var s;
		s = this;
		return $internalize(s.Object.perspectiveOrigin, $String);
	};
	CSSStyleDeclaration.prototype.PerspectiveOrigin = function() { return this.$val.PerspectiveOrigin(); };
	CSSStyleDeclaration.ptr.prototype.SetPerspectiveOrigin = function(v) {
		var s, v;
		s = this;
		s.Object.perspectiveOrigin = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetPerspectiveOrigin = function(v) { return this.$val.SetPerspectiveOrigin(v); };
	CSSStyleDeclaration.ptr.prototype.Position = function() {
		var s;
		s = this;
		return $internalize(s.Object.position, $String);
	};
	CSSStyleDeclaration.prototype.Position = function() { return this.$val.Position(); };
	CSSStyleDeclaration.ptr.prototype.SetPosition = function(v) {
		var s, v;
		s = this;
		s.Object.position = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetPosition = function(v) { return this.$val.SetPosition(v); };
	CSSStyleDeclaration.ptr.prototype.Quotes = function() {
		var s;
		s = this;
		return $internalize(s.Object.quotes, $String);
	};
	CSSStyleDeclaration.prototype.Quotes = function() { return this.$val.Quotes(); };
	CSSStyleDeclaration.ptr.prototype.SetQuotes = function(v) {
		var s, v;
		s = this;
		s.Object.quotes = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetQuotes = function(v) { return this.$val.SetQuotes(v); };
	CSSStyleDeclaration.ptr.prototype.Resize = function() {
		var s;
		s = this;
		return $internalize(s.Object.resize, $String);
	};
	CSSStyleDeclaration.prototype.Resize = function() { return this.$val.Resize(); };
	CSSStyleDeclaration.ptr.prototype.SetResize = function(v) {
		var s, v;
		s = this;
		s.Object.resize = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetResize = function(v) { return this.$val.SetResize(v); };
	CSSStyleDeclaration.ptr.prototype.Right = function() {
		var s;
		s = this;
		return $internalize(s.Object.right, $String);
	};
	CSSStyleDeclaration.prototype.Right = function() { return this.$val.Right(); };
	CSSStyleDeclaration.ptr.prototype.SetRight = function(v) {
		var s, v;
		s = this;
		s.Object.right = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetRight = function(v) { return this.$val.SetRight(v); };
	CSSStyleDeclaration.ptr.prototype.TableLayout = function() {
		var s;
		s = this;
		return $internalize(s.Object.tableLayout, $String);
	};
	CSSStyleDeclaration.prototype.TableLayout = function() { return this.$val.TableLayout(); };
	CSSStyleDeclaration.ptr.prototype.SetTableLayout = function(v) {
		var s, v;
		s = this;
		s.Object.tableLayout = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTableLayout = function(v) { return this.$val.SetTableLayout(v); };
	CSSStyleDeclaration.ptr.prototype.TabSize = function() {
		var s;
		s = this;
		return $internalize(s.Object.tabSize, $String);
	};
	CSSStyleDeclaration.prototype.TabSize = function() { return this.$val.TabSize(); };
	CSSStyleDeclaration.ptr.prototype.SetTabSize = function(v) {
		var s, v;
		s = this;
		s.Object.tabSize = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTabSize = function(v) { return this.$val.SetTabSize(v); };
	CSSStyleDeclaration.ptr.prototype.TextAlign = function() {
		var s;
		s = this;
		return $internalize(s.Object.textAlign, $String);
	};
	CSSStyleDeclaration.prototype.TextAlign = function() { return this.$val.TextAlign(); };
	CSSStyleDeclaration.ptr.prototype.SetTextAlign = function(v) {
		var s, v;
		s = this;
		s.Object.textAlign = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTextAlign = function(v) { return this.$val.SetTextAlign(v); };
	CSSStyleDeclaration.ptr.prototype.TextAlignLast = function() {
		var s;
		s = this;
		return $internalize(s.Object.textAlignLast, $String);
	};
	CSSStyleDeclaration.prototype.TextAlignLast = function() { return this.$val.TextAlignLast(); };
	CSSStyleDeclaration.ptr.prototype.SetTextAlignLast = function(v) {
		var s, v;
		s = this;
		s.Object.textAlignLast = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTextAlignLast = function(v) { return this.$val.SetTextAlignLast(v); };
	CSSStyleDeclaration.ptr.prototype.TextDecoration = function() {
		var s;
		s = this;
		return $internalize(s.Object.textDecoration, $String);
	};
	CSSStyleDeclaration.prototype.TextDecoration = function() { return this.$val.TextDecoration(); };
	CSSStyleDeclaration.ptr.prototype.SetTextDecoration = function(v) {
		var s, v;
		s = this;
		s.Object.textDecoration = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTextDecoration = function(v) { return this.$val.SetTextDecoration(v); };
	CSSStyleDeclaration.ptr.prototype.TextDecorationColor = function() {
		var s;
		s = this;
		return $internalize(s.Object.textDecorationColor, $String);
	};
	CSSStyleDeclaration.prototype.TextDecorationColor = function() { return this.$val.TextDecorationColor(); };
	CSSStyleDeclaration.ptr.prototype.SetTextDecorationColor = function(v) {
		var s, v;
		s = this;
		s.Object.textDecorationColor = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTextDecorationColor = function(v) { return this.$val.SetTextDecorationColor(v); };
	CSSStyleDeclaration.ptr.prototype.TextDecorationLine = function() {
		var s;
		s = this;
		return $internalize(s.Object.textDecorationLine, $String);
	};
	CSSStyleDeclaration.prototype.TextDecorationLine = function() { return this.$val.TextDecorationLine(); };
	CSSStyleDeclaration.ptr.prototype.SetTextDecorationLine = function(v) {
		var s, v;
		s = this;
		s.Object.textDecorationLine = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTextDecorationLine = function(v) { return this.$val.SetTextDecorationLine(v); };
	CSSStyleDeclaration.ptr.prototype.TextDecorationStyle = function() {
		var s;
		s = this;
		return $internalize(s.Object.textDecorationStyle, $String);
	};
	CSSStyleDeclaration.prototype.TextDecorationStyle = function() { return this.$val.TextDecorationStyle(); };
	CSSStyleDeclaration.ptr.prototype.SetTextDecorationStyle = function(v) {
		var s, v;
		s = this;
		s.Object.textDecorationStyle = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTextDecorationStyle = function(v) { return this.$val.SetTextDecorationStyle(v); };
	CSSStyleDeclaration.ptr.prototype.TextIndent = function() {
		var s;
		s = this;
		return $internalize(s.Object.textIndent, $String);
	};
	CSSStyleDeclaration.prototype.TextIndent = function() { return this.$val.TextIndent(); };
	CSSStyleDeclaration.ptr.prototype.SetTextIndent = function(v) {
		var s, v;
		s = this;
		s.Object.textIndent = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTextIndent = function(v) { return this.$val.SetTextIndent(v); };
	CSSStyleDeclaration.ptr.prototype.TextOverflow = function() {
		var s;
		s = this;
		return $internalize(s.Object.textOverflow, $String);
	};
	CSSStyleDeclaration.prototype.TextOverflow = function() { return this.$val.TextOverflow(); };
	CSSStyleDeclaration.ptr.prototype.SetTextOverflow = function(v) {
		var s, v;
		s = this;
		s.Object.textOverflow = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTextOverflow = function(v) { return this.$val.SetTextOverflow(v); };
	CSSStyleDeclaration.ptr.prototype.TextShadow = function() {
		var s;
		s = this;
		return $internalize(s.Object.textShadow, $String);
	};
	CSSStyleDeclaration.prototype.TextShadow = function() { return this.$val.TextShadow(); };
	CSSStyleDeclaration.ptr.prototype.SetTextShadow = function(v) {
		var s, v;
		s = this;
		s.Object.textShadow = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTextShadow = function(v) { return this.$val.SetTextShadow(v); };
	CSSStyleDeclaration.ptr.prototype.TextTransform = function() {
		var s;
		s = this;
		return $internalize(s.Object.textTransform, $String);
	};
	CSSStyleDeclaration.prototype.TextTransform = function() { return this.$val.TextTransform(); };
	CSSStyleDeclaration.ptr.prototype.SetTextTransform = function(v) {
		var s, v;
		s = this;
		s.Object.textTransform = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTextTransform = function(v) { return this.$val.SetTextTransform(v); };
	CSSStyleDeclaration.ptr.prototype.Top = function() {
		var s;
		s = this;
		return $internalize(s.Object.top, $String);
	};
	CSSStyleDeclaration.prototype.Top = function() { return this.$val.Top(); };
	CSSStyleDeclaration.ptr.prototype.SetTop = function(v) {
		var s, v;
		s = this;
		s.Object.top = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTop = function(v) { return this.$val.SetTop(v); };
	CSSStyleDeclaration.ptr.prototype.Transform = function() {
		var s;
		s = this;
		return $internalize(s.Object.transform, $String);
	};
	CSSStyleDeclaration.prototype.Transform = function() { return this.$val.Transform(); };
	CSSStyleDeclaration.ptr.prototype.SetTransform = function(v) {
		var s, v;
		s = this;
		s.Object.transform = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTransform = function(v) { return this.$val.SetTransform(v); };
	CSSStyleDeclaration.ptr.prototype.TransformOrigin = function() {
		var s;
		s = this;
		return $internalize(s.Object.transformOrigin, $String);
	};
	CSSStyleDeclaration.prototype.TransformOrigin = function() { return this.$val.TransformOrigin(); };
	CSSStyleDeclaration.ptr.prototype.SetTransformOrigin = function(v) {
		var s, v;
		s = this;
		s.Object.transformOrigin = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTransformOrigin = function(v) { return this.$val.SetTransformOrigin(v); };
	CSSStyleDeclaration.ptr.prototype.TransformStyle = function() {
		var s;
		s = this;
		return $internalize(s.Object.transformStyle, $String);
	};
	CSSStyleDeclaration.prototype.TransformStyle = function() { return this.$val.TransformStyle(); };
	CSSStyleDeclaration.ptr.prototype.SetTransformStyle = function(v) {
		var s, v;
		s = this;
		s.Object.transformStyle = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTransformStyle = function(v) { return this.$val.SetTransformStyle(v); };
	CSSStyleDeclaration.ptr.prototype.Transition = function() {
		var s;
		s = this;
		return $internalize(s.Object.transition, $String);
	};
	CSSStyleDeclaration.prototype.Transition = function() { return this.$val.Transition(); };
	CSSStyleDeclaration.ptr.prototype.SetTransition = function(v) {
		var s, v;
		s = this;
		s.Object.transition = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTransition = function(v) { return this.$val.SetTransition(v); };
	CSSStyleDeclaration.ptr.prototype.TransitionProperty = function() {
		var s;
		s = this;
		return $internalize(s.Object.transitionProperty, $String);
	};
	CSSStyleDeclaration.prototype.TransitionProperty = function() { return this.$val.TransitionProperty(); };
	CSSStyleDeclaration.ptr.prototype.SetTransitionProperty = function(v) {
		var s, v;
		s = this;
		s.Object.transitionProperty = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTransitionProperty = function(v) { return this.$val.SetTransitionProperty(v); };
	CSSStyleDeclaration.ptr.prototype.TransitionDuration = function() {
		var s;
		s = this;
		return $internalize(s.Object.transitionDuration, $String);
	};
	CSSStyleDeclaration.prototype.TransitionDuration = function() { return this.$val.TransitionDuration(); };
	CSSStyleDeclaration.ptr.prototype.SetTransitionDuration = function(v) {
		var s, v;
		s = this;
		s.Object.transitionDuration = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTransitionDuration = function(v) { return this.$val.SetTransitionDuration(v); };
	CSSStyleDeclaration.ptr.prototype.TransitionTimingFunction = function() {
		var s;
		s = this;
		return $internalize(s.Object.transitionTimingFunction, $String);
	};
	CSSStyleDeclaration.prototype.TransitionTimingFunction = function() { return this.$val.TransitionTimingFunction(); };
	CSSStyleDeclaration.ptr.prototype.SetTransitionTimingFunction = function(v) {
		var s, v;
		s = this;
		s.Object.transitionTimingFunction = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTransitionTimingFunction = function(v) { return this.$val.SetTransitionTimingFunction(v); };
	CSSStyleDeclaration.ptr.prototype.TransitionDelay = function() {
		var s;
		s = this;
		return $internalize(s.Object.transitionDelay, $String);
	};
	CSSStyleDeclaration.prototype.TransitionDelay = function() { return this.$val.TransitionDelay(); };
	CSSStyleDeclaration.ptr.prototype.SetTransitionDelay = function(v) {
		var s, v;
		s = this;
		s.Object.transitionDelay = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetTransitionDelay = function(v) { return this.$val.SetTransitionDelay(v); };
	CSSStyleDeclaration.ptr.prototype.UnicodeBidi = function() {
		var s;
		s = this;
		return $internalize(s.Object.unicodeBidi, $String);
	};
	CSSStyleDeclaration.prototype.UnicodeBidi = function() { return this.$val.UnicodeBidi(); };
	CSSStyleDeclaration.ptr.prototype.SetUnicodeBidi = function(v) {
		var s, v;
		s = this;
		s.Object.unicodeBidi = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetUnicodeBidi = function(v) { return this.$val.SetUnicodeBidi(v); };
	CSSStyleDeclaration.ptr.prototype.UserSelect = function() {
		var s;
		s = this;
		return $internalize(s.Object.userSelect, $String);
	};
	CSSStyleDeclaration.prototype.UserSelect = function() { return this.$val.UserSelect(); };
	CSSStyleDeclaration.ptr.prototype.SetUserSelect = function(v) {
		var s, v;
		s = this;
		s.Object.userSelect = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetUserSelect = function(v) { return this.$val.SetUserSelect(v); };
	CSSStyleDeclaration.ptr.prototype.VerticalAlign = function() {
		var s;
		s = this;
		return $internalize(s.Object.verticalAlign, $String);
	};
	CSSStyleDeclaration.prototype.VerticalAlign = function() { return this.$val.VerticalAlign(); };
	CSSStyleDeclaration.ptr.prototype.SetVerticalAlign = function(v) {
		var s, v;
		s = this;
		s.Object.verticalAlign = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetVerticalAlign = function(v) { return this.$val.SetVerticalAlign(v); };
	CSSStyleDeclaration.ptr.prototype.Visibility = function() {
		var s;
		s = this;
		return $internalize(s.Object.visibility, $String);
	};
	CSSStyleDeclaration.prototype.Visibility = function() { return this.$val.Visibility(); };
	CSSStyleDeclaration.ptr.prototype.SetVisibility = function(v) {
		var s, v;
		s = this;
		s.Object.visibility = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetVisibility = function(v) { return this.$val.SetVisibility(v); };
	CSSStyleDeclaration.ptr.prototype.WhiteSpace = function() {
		var s;
		s = this;
		return $internalize(s.Object.whiteSpace, $String);
	};
	CSSStyleDeclaration.prototype.WhiteSpace = function() { return this.$val.WhiteSpace(); };
	CSSStyleDeclaration.ptr.prototype.SetWhiteSpace = function(v) {
		var s, v;
		s = this;
		s.Object.whiteSpace = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetWhiteSpace = function(v) { return this.$val.SetWhiteSpace(v); };
	CSSStyleDeclaration.ptr.prototype.Width = function() {
		var s;
		s = this;
		return $internalize(s.Object.width, $String);
	};
	CSSStyleDeclaration.prototype.Width = function() { return this.$val.Width(); };
	CSSStyleDeclaration.ptr.prototype.SetWidth = function(v) {
		var s, v;
		s = this;
		s.Object.width = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetWidth = function(v) { return this.$val.SetWidth(v); };
	CSSStyleDeclaration.ptr.prototype.WordBreak = function() {
		var s;
		s = this;
		return $internalize(s.Object.wordBreak, $String);
	};
	CSSStyleDeclaration.prototype.WordBreak = function() { return this.$val.WordBreak(); };
	CSSStyleDeclaration.ptr.prototype.SetWordBreak = function(v) {
		var s, v;
		s = this;
		s.Object.wordBreak = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetWordBreak = function(v) { return this.$val.SetWordBreak(v); };
	CSSStyleDeclaration.ptr.prototype.WordSpacing = function() {
		var s;
		s = this;
		return $internalize(s.Object.wordSpacing, $String);
	};
	CSSStyleDeclaration.prototype.WordSpacing = function() { return this.$val.WordSpacing(); };
	CSSStyleDeclaration.ptr.prototype.SetWordSpacing = function(v) {
		var s, v;
		s = this;
		s.Object.wordSpacing = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetWordSpacing = function(v) { return this.$val.SetWordSpacing(v); };
	CSSStyleDeclaration.ptr.prototype.WordWrap = function() {
		var s;
		s = this;
		return $internalize(s.Object.wordWrap, $String);
	};
	CSSStyleDeclaration.prototype.WordWrap = function() { return this.$val.WordWrap(); };
	CSSStyleDeclaration.ptr.prototype.SetWordWrap = function(v) {
		var s, v;
		s = this;
		s.Object.wordWrap = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetWordWrap = function(v) { return this.$val.SetWordWrap(v); };
	CSSStyleDeclaration.ptr.prototype.Widows = function() {
		var s;
		s = this;
		return $internalize(s.Object.widows, $String);
	};
	CSSStyleDeclaration.prototype.Widows = function() { return this.$val.Widows(); };
	CSSStyleDeclaration.ptr.prototype.SetWidows = function(v) {
		var s, v;
		s = this;
		s.Object.widows = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetWidows = function(v) { return this.$val.SetWidows(v); };
	CSSStyleDeclaration.ptr.prototype.ZIndex = function() {
		var s;
		s = this;
		return $internalize(s.Object.zIndex, $String);
	};
	CSSStyleDeclaration.prototype.ZIndex = function() { return this.$val.ZIndex(); };
	CSSStyleDeclaration.ptr.prototype.SetZIndex = function(v) {
		var s, v;
		s = this;
		s.Object.zIndex = $externalize(v, $String);
	};
	CSSStyleDeclaration.prototype.SetZIndex = function(v) { return this.$val.SetZIndex(v); };
	Object.ptr.prototype.ActiveElement = function() {
		var o;
		o = this;
		return new Object.ptr(o.Object.activeElement);
	};
	Object.prototype.ActiveElement = function() { return this.$val.ActiveElement(); };
	Object.ptr.prototype.CreateElement = function(tag) {
		var o, tag;
		o = this;
		return new Object.ptr($pkg.Document.Object.createElement($externalize(tag, $String)));
	};
	Object.prototype.CreateElement = function(tag) { return this.$val.CreateElement(tag); };
	Object.ptr.prototype.CreateTextNode = function(textContent) {
		var o, textContent;
		o = this;
		return new Object.ptr($pkg.Document.Object.createTextNode($externalize(textContent, $String)));
	};
	Object.prototype.CreateTextNode = function(textContent) { return this.$val.CreateTextNode(textContent); };
	Object.ptr.prototype.GetElementById = function(id) {
		var id, o;
		o = this;
		return new Object.ptr(o.Object.getElementById($externalize(id, $String)));
	};
	Object.prototype.GetElementById = function(id) { return this.$val.GetElementById(id); };
	Object.ptr.prototype.Write = function(markup) {
		var markup, o;
		o = this;
		$pkg.Document.Object.write($externalize(markup, $String));
	};
	Object.prototype.Write = function(markup) { return this.$val.Write(markup); };
	DOMRect.ptr.prototype.X = function() {
		var r;
		r = this;
		return $parseFloat(r.Object.x);
	};
	DOMRect.prototype.X = function() { return this.$val.X(); };
	DOMRect.ptr.prototype.Y = function() {
		var r;
		r = this;
		return $parseFloat(r.Object.y);
	};
	DOMRect.prototype.Y = function() { return this.$val.Y(); };
	DOMRect.ptr.prototype.Width = function() {
		var r;
		r = this;
		return $parseFloat(r.Object.width);
	};
	DOMRect.prototype.Width = function() { return this.$val.Width(); };
	DOMRect.ptr.prototype.Height = function() {
		var r;
		r = this;
		return $parseFloat(r.Object.height);
	};
	DOMRect.prototype.Height = function() { return this.$val.Height(); };
	DOMRect.ptr.prototype.Top = function() {
		var r;
		r = this;
		return $parseFloat(r.Object.top);
	};
	DOMRect.prototype.Top = function() { return this.$val.Top(); };
	DOMRect.ptr.prototype.Right = function() {
		var r;
		r = this;
		return $parseFloat(r.Object.right);
	};
	DOMRect.prototype.Right = function() { return this.$val.Right(); };
	DOMRect.ptr.prototype.Bottom = function() {
		var r;
		r = this;
		return $parseFloat(r.Object.bottom);
	};
	DOMRect.prototype.Bottom = function() { return this.$val.Bottom(); };
	DOMRect.ptr.prototype.Left = function() {
		var r;
		r = this;
		return $parseFloat(r.Object.left);
	};
	DOMRect.prototype.Left = function() { return this.$val.Left(); };
	Object.ptr.prototype.ClassList = function() {
		var o;
		o = this;
		return new DOMTokenList.ptr(o.Object.classList);
	};
	Object.prototype.ClassList = function() { return this.$val.ClassList(); };
	Object.ptr.prototype.InnerHTML = function() {
		var o;
		o = this;
		return $internalize(o.Object.innerHTML, $String);
	};
	Object.prototype.InnerHTML = function() { return this.$val.InnerHTML(); };
	Object.ptr.prototype.SetInnerHTML = function(html) {
		var html, o;
		o = this;
		o.Object.innerHTML = $externalize(html, $String);
	};
	Object.prototype.SetInnerHTML = function(html) { return this.$val.SetInnerHTML(html); };
	Object.ptr.prototype.OuterHTML = function() {
		var o;
		o = this;
		return $internalize(o.Object.outerHTML, $String);
	};
	Object.prototype.OuterHTML = function() { return this.$val.OuterHTML(); };
	Object.ptr.prototype.SetOuterHTML = function(html) {
		var html, o;
		o = this;
		o.Object.outerHTML = $externalize(html, $String);
	};
	Object.prototype.SetOuterHTML = function(html) { return this.$val.SetOuterHTML(html); };
	Object.ptr.prototype.TagName = function() {
		var o;
		o = this;
		return $internalize(o.Object.tagName, $String);
	};
	Object.prototype.TagName = function() { return this.$val.TagName(); };
	Object.ptr.prototype.GetAttribute = function(attributeName) {
		var attributeName, o;
		o = this;
		return $internalize(o.Object.getAttribute($externalize(attributeName, $String)), $String);
	};
	Object.prototype.GetAttribute = function(attributeName) { return this.$val.GetAttribute(attributeName); };
	Object.ptr.prototype.GetBoundingClientRect = function() {
		var o;
		o = this;
		return new DOMRect.ptr(o.Object.getBoundingClientRect());
	};
	Object.prototype.GetBoundingClientRect = function() { return this.$val.GetBoundingClientRect(); };
	Object.ptr.prototype.QuerySelector = function(selectors) {
		var o, selectors;
		o = this;
		return new Object.ptr(o.Object.querySelector($externalize(selectors, $String)));
	};
	Object.prototype.QuerySelector = function(selectors) { return this.$val.QuerySelector(selectors); };
	Object.ptr.prototype.QuerySelectorAll = function(selectors) {
		var i, length, nodeList, nodes, o, selectors;
		o = this;
		nodeList = o.Object.querySelectorAll($externalize(selectors, $String));
		length = $parseInt(nodeList.length) >> 0;
		nodes = sliceType.nil;
		i = 0;
		while (true) {
			if (!(i < length)) { break; }
			nodes = $append(nodes, new Object.ptr(nodeList.item(i)));
			i = i + (1) >> 0;
		}
		return nodes;
	};
	Object.prototype.QuerySelectorAll = function(selectors) { return this.$val.QuerySelectorAll(selectors); };
	Event.ptr.prototype.Target = function() {
		var e;
		e = this;
		return new Object.ptr(e.Object.target);
	};
	Event.prototype.Target = function() { return this.$val.Target(); };
	Event.ptr.prototype.PreventDefault = function() {
		var e;
		e = this;
		e.Object.preventDefault();
	};
	Event.prototype.PreventDefault = function() { return this.$val.PreventDefault(); };
	Event.ptr.prototype.StopImmediatePropagation = function() {
		var e;
		e = this;
		e.Object.stopImmediatePropagation();
	};
	Event.prototype.StopImmediatePropagation = function() { return this.$val.StopImmediatePropagation(); };
	Event.ptr.prototype.StopPropagation = function() {
		var e;
		e = this;
		e.Object.stopPropagation();
	};
	Event.prototype.StopPropagation = function() { return this.$val.StopPropagation(); };
	Object.ptr.prototype.AddEventListener = function(t, listener, args) {
		var args, listener, o, t;
		o = this;
		if (args.$length === 1) {
			o.Object.addEventListener($externalize(t, $String), $externalize(listener, funcType), $externalize((0 >= args.$length ? ($throwRuntimeError("index out of range"), undefined) : args.$array[args.$offset + 0]), $emptyInterface));
		} else {
			o.Object.addEventListener($externalize(t, $String), $externalize(listener, funcType));
		}
	};
	Object.prototype.AddEventListener = function(t, listener, args) { return this.$val.AddEventListener(t, listener, args); };
	Object.ptr.prototype.RemoveEventListener = function(t, listener, args) {
		var args, listener, o, t;
		o = this;
		if (args.$length === 1) {
			o.Object.removeEventListener($externalize(t, $String), $externalize(listener, funcType), $externalize((0 >= args.$length ? ($throwRuntimeError("index out of range"), undefined) : args.$array[args.$offset + 0]), $emptyInterface));
		} else {
			o.Object.removeEventListener($externalize(t, $String), $externalize(listener, funcType));
		}
	};
	Object.prototype.RemoveEventListener = function(t, listener, args) { return this.$val.RemoveEventListener(t, listener, args); };
	Object.ptr.prototype.RemoveAllChildNodes = function() {
		var o;
		o = this;
		while (true) {
			if (!(o.HasChildNodes())) { break; }
			o.RemoveChild(o.LastChild());
		}
	};
	Object.prototype.RemoveAllChildNodes = function() { return this.$val.RemoveAllChildNodes(); };
	Object.ptr.prototype.AppendBefore = function(n) {
		var n, o;
		o = this;
		o.ParentNode().InsertBefore(n, o);
	};
	Object.prototype.AppendBefore = function(n) { return this.$val.AppendBefore(n); };
	Object.ptr.prototype.AppendAfter = function(n) {
		var n, o;
		o = this;
		o.ParentNode().InsertBefore(n, o.NextSibling());
	};
	Object.prototype.AppendAfter = function(n) { return this.$val.AppendAfter(n); };
	Object.ptr.prototype.IsFocused = function() {
		var o;
		o = this;
		return o.IsEqualNode($pkg.Document.ActiveElement());
	};
	Object.prototype.IsFocused = function() { return this.$val.IsFocused(); };
	Object.ptr.prototype.Style = function() {
		var o;
		o = this;
		return new CSSStyleDeclaration.ptr(o.Object.style);
	};
	Object.prototype.Style = function() { return this.$val.Style(); };
	Object.ptr.prototype.Dataset = function() {
		var o;
		o = this;
		return new Object.ptr(o.Object.dataset);
	};
	Object.prototype.Dataset = function() { return this.$val.Dataset(); };
	Object.ptr.prototype.Blur = function() {
		var o;
		o = this;
		o.Object.blur();
	};
	Object.prototype.Blur = function() { return this.$val.Blur(); };
	Object.ptr.prototype.Focus = function() {
		var o;
		o = this;
		o.Object.focus();
	};
	Object.prototype.Focus = function() { return this.$val.Focus(); };
	Object.ptr.prototype.Value = function() {
		var o;
		o = this;
		return $internalize(o.Object.value, $String);
	};
	Object.prototype.Value = function() { return this.$val.Value(); };
	Object.ptr.prototype.SetValue = function(s) {
		var o, s;
		o = this;
		o.Object.value = $externalize(s, $String);
	};
	Object.prototype.SetValue = function(s) { return this.$val.SetValue(s); };
	Event.ptr.prototype.Key = function() {
		var e;
		e = this;
		return $internalize(e.Object.key, $String);
	};
	Event.prototype.Key = function() { return this.$val.Key(); };
	Event.ptr.prototype.KeyCode = function() {
		var e;
		e = this;
		return $parseInt(e.Object.keyCode) >> 0;
	};
	Event.prototype.KeyCode = function() { return this.$val.KeyCode(); };
	Object.ptr.prototype.ChildNodes = function() {
		var i, length, nodeList, nodes, o;
		o = this;
		nodeList = o.Object.childNodes;
		length = $parseInt(nodeList.length) >> 0;
		nodes = sliceType.nil;
		i = 0;
		while (true) {
			if (!(i < length)) { break; }
			nodes = $append(nodes, new Object.ptr(nodeList.item(i)));
			i = i + (1) >> 0;
		}
		return nodes;
	};
	Object.prototype.ChildNodes = function() { return this.$val.ChildNodes(); };
	Object.ptr.prototype.FirstChild = function() {
		var o;
		o = this;
		return new Object.ptr(o.Object.firstChild);
	};
	Object.prototype.FirstChild = function() { return this.$val.FirstChild(); };
	Object.ptr.prototype.LastChild = function() {
		var o;
		o = this;
		return new Object.ptr(o.Object.lastChild);
	};
	Object.prototype.LastChild = function() { return this.$val.LastChild(); };
	Object.ptr.prototype.NextSibling = function() {
		var o;
		o = this;
		return new Object.ptr(o.Object.nextSibling);
	};
	Object.prototype.NextSibling = function() { return this.$val.NextSibling(); };
	Object.ptr.prototype.NodeType = function() {
		var o;
		o = this;
		return $parseInt(o.Object.nodeType) >> 0;
	};
	Object.prototype.NodeType = function() { return this.$val.NodeType(); };
	Object.ptr.prototype.NodeValue = function() {
		var o;
		o = this;
		return $internalize(o.Object.nodeValue, $String);
	};
	Object.prototype.NodeValue = function() { return this.$val.NodeValue(); };
	Object.ptr.prototype.SetNodeValue = function(s) {
		var o, s;
		o = this;
		o.Object.nodeValue = $externalize(s, $String);
	};
	Object.prototype.SetNodeValue = function(s) { return this.$val.SetNodeValue(s); };
	Object.ptr.prototype.ParentNode = function() {
		var o;
		o = this;
		return new Object.ptr(o.Object.parentNode);
	};
	Object.prototype.ParentNode = function() { return this.$val.ParentNode(); };
	Object.ptr.prototype.TextContent = function() {
		var o;
		o = this;
		return $internalize(o.Object.textContent, $String);
	};
	Object.prototype.TextContent = function() { return this.$val.TextContent(); };
	Object.ptr.prototype.SetTextContent = function(s) {
		var o, s;
		o = this;
		o.Object.textContent = $externalize(s, $String);
	};
	Object.prototype.SetTextContent = function(s) { return this.$val.SetTextContent(s); };
	Object.ptr.prototype.AppendChild = function(c) {
		var c, o;
		o = this;
		o.Object.appendChild($externalize(c, ptrType));
	};
	Object.prototype.AppendChild = function(c) { return this.$val.AppendChild(c); };
	Object.ptr.prototype.HasChildNodes = function() {
		var o;
		o = this;
		return !!(o.Object.hasChildNodes());
	};
	Object.prototype.HasChildNodes = function() { return this.$val.HasChildNodes(); };
	Object.ptr.prototype.InsertBefore = function(newNode, referenceNode) {
		var newNode, o, referenceNode;
		o = this;
		return new Object.ptr(o.Object.insertBefore($externalize(newNode, ptrType), $externalize(referenceNode, ptrType)));
	};
	Object.prototype.InsertBefore = function(newNode, referenceNode) { return this.$val.InsertBefore(newNode, referenceNode); };
	Object.ptr.prototype.IsEqualNode = function(n) {
		var n, o;
		o = this;
		return !!(o.Object.isEqualNode($externalize(n, ptrType)));
	};
	Object.prototype.IsEqualNode = function(n) { return this.$val.IsEqualNode(n); };
	Object.ptr.prototype.IsSameNode = function(n) {
		var n, o;
		o = this;
		return !!(o.Object.isSameNode($externalize(n, ptrType)));
	};
	Object.prototype.IsSameNode = function(n) { return this.$val.IsSameNode(n); };
	Object.ptr.prototype.RemoveChild = function(c) {
		var c, o;
		o = this;
		return new Object.ptr(o.Object.removeChild($externalize(c, ptrType)));
	};
	Object.prototype.RemoveChild = function(c) { return this.$val.RemoveChild(c); };
	DOMTokenList.ptr.prototype.Length = function() {
		var t;
		t = this;
		return $parseInt(t.Object.length) >> 0;
	};
	DOMTokenList.prototype.Length = function() { return this.$val.Length(); };
	DOMTokenList.ptr.prototype.Contains = function(s) {
		var s, t;
		t = this;
		return !!(t.Object.contains($externalize(s, $String)));
	};
	DOMTokenList.prototype.Contains = function(s) { return this.$val.Contains(s); };
	DOMTokenList.ptr.prototype.Add = function(s) {
		var s, t;
		t = this;
		t.Object.add($externalize(s, $String));
	};
	DOMTokenList.prototype.Add = function(s) { return this.$val.Add(s); };
	DOMTokenList.ptr.prototype.Remove = function(s) {
		var s, t;
		t = this;
		t.Object.remove($externalize(s, $String));
	};
	DOMTokenList.prototype.Remove = function(s) { return this.$val.Remove(s); };
	DOMTokenList.ptr.prototype.Toggle = function(s) {
		var s, t;
		t = this;
		t.Object.toggle($externalize(s, $String));
	};
	DOMTokenList.prototype.Toggle = function(s) { return this.$val.Toggle(s); };
	ptrType$1.methods = [{prop: "CssText", name: "CssText", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Length", name: "Length", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "AlignContent", name: "AlignContent", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAlignContent", name: "SetAlignContent", pkg: "", typ: $funcType([$String], [], false)}, {prop: "AlignItems", name: "AlignItems", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAlignItems", name: "SetAlignItems", pkg: "", typ: $funcType([$String], [], false)}, {prop: "AlignSelf", name: "AlignSelf", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAlignSelf", name: "SetAlignSelf", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Animation", name: "Animation", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAnimation", name: "SetAnimation", pkg: "", typ: $funcType([$String], [], false)}, {prop: "AnimationDelay", name: "AnimationDelay", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAnimationDelay", name: "SetAnimationDelay", pkg: "", typ: $funcType([$String], [], false)}, {prop: "AnimationDirection", name: "AnimationDirection", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAnimationDirection", name: "SetAnimationDirection", pkg: "", typ: $funcType([$String], [], false)}, {prop: "AnimationDuration", name: "AnimationDuration", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAnimationDuration", name: "SetAnimationDuration", pkg: "", typ: $funcType([$String], [], false)}, {prop: "AnimationFillMode", name: "AnimationFillMode", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAnimationFillMode", name: "SetAnimationFillMode", pkg: "", typ: $funcType([$String], [], false)}, {prop: "AnimationIterationCount", name: "AnimationIterationCount", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAnimationIterationCount", name: "SetAnimationIterationCount", pkg: "", typ: $funcType([$String], [], false)}, {prop: "AnimationName", name: "AnimationName", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAnimationName", name: "SetAnimationName", pkg: "", typ: $funcType([$String], [], false)}, {prop: "AnimationTimingFunction", name: "AnimationTimingFunction", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAnimationTimingFunction", name: "SetAnimationTimingFunction", pkg: "", typ: $funcType([$String], [], false)}, {prop: "AnimationPlayState", name: "AnimationPlayState", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetAnimationPlayState", name: "SetAnimationPlayState", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Background", name: "Background", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBackground", name: "SetBackground", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BackgroundAttachment", name: "BackgroundAttachment", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBackgroundAttachment", name: "SetBackgroundAttachment", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BackgroundColor", name: "BackgroundColor", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBackgroundColor", name: "SetBackgroundColor", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BackgroundImage", name: "BackgroundImage", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBackgroundImage", name: "SetBackgroundImage", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BackgroundPosition", name: "BackgroundPosition", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBackgroundPosition", name: "SetBackgroundPosition", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BackgroundRepeat", name: "BackgroundRepeat", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBackgroundRepeat", name: "SetBackgroundRepeat", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BackgroundClip", name: "BackgroundClip", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBackgroundClip", name: "SetBackgroundClip", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BackgroundOrigin", name: "BackgroundOrigin", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBackgroundOrigin", name: "SetBackgroundOrigin", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BackgroundSize", name: "BackgroundSize", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBackgroundSize", name: "SetBackgroundSize", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BackfaceVisibility", name: "BackfaceVisibility", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBackfaceVisibility", name: "SetBackfaceVisibility", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Border", name: "Border", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorder", name: "SetBorder", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderBottom", name: "BorderBottom", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderBottom", name: "SetBorderBottom", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderBottomColor", name: "BorderBottomColor", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderBottomColor", name: "SetBorderBottomColor", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderBottomLeftRadius", name: "BorderBottomLeftRadius", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderBottomLeftRadius", name: "SetBorderBottomLeftRadius", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderBottomRightRadius", name: "BorderBottomRightRadius", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderBottomRightRadius", name: "SetBorderBottomRightRadius", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderBottomStyle", name: "BorderBottomStyle", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderBottomStyle", name: "SetBorderBottomStyle", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderBottomWidth", name: "BorderBottomWidth", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderBottomWidth", name: "SetBorderBottomWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderCollapse", name: "BorderCollapse", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderCollapse", name: "SetBorderCollapse", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderColor", name: "BorderColor", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderColor", name: "SetBorderColor", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderImage", name: "BorderImage", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderImage", name: "SetBorderImage", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderImageOutset", name: "BorderImageOutset", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderImageOutset", name: "SetBorderImageOutset", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderImageRepeat", name: "BorderImageRepeat", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderImageRepeat", name: "SetBorderImageRepeat", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderImageSlice", name: "BorderImageSlice", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderImageSlice", name: "SetBorderImageSlice", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderImageSource", name: "BorderImageSource", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderImageSource", name: "SetBorderImageSource", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderImageWidth", name: "BorderImageWidth", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderImageWidth", name: "SetBorderImageWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderLeft", name: "BorderLeft", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderLeft", name: "SetBorderLeft", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderLeftColor", name: "BorderLeftColor", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderLeftColor", name: "SetBorderLeftColor", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderLeftStyle", name: "BorderLeftStyle", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderLeftStyle", name: "SetBorderLeftStyle", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderLeftWidth", name: "BorderLeftWidth", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderLeftWidth", name: "SetBorderLeftWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderRadius", name: "BorderRadius", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderRadius", name: "SetBorderRadius", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderRight", name: "BorderRight", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderRight", name: "SetBorderRight", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderRightColor", name: "BorderRightColor", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderRightColor", name: "SetBorderRightColor", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderRightStyle", name: "BorderRightStyle", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderRightStyle", name: "SetBorderRightStyle", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderRightWidth", name: "BorderRightWidth", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderRightWidth", name: "SetBorderRightWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderSpacing", name: "BorderSpacing", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderSpacing", name: "SetBorderSpacing", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderStyle", name: "BorderStyle", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderStyle", name: "SetBorderStyle", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderTop", name: "BorderTop", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderTop", name: "SetBorderTop", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderTopColor", name: "BorderTopColor", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderTopColor", name: "SetBorderTopColor", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderTopLeftRadius", name: "BorderTopLeftRadius", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderTopLeftRadius", name: "SetBorderTopLeftRadius", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderTopRightRadius", name: "BorderTopRightRadius", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderTopRightRadius", name: "SetBorderTopRightRadius", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderTopStyle", name: "BorderTopStyle", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderTopStyle", name: "SetBorderTopStyle", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderTopWidth", name: "BorderTopWidth", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderTopWidth", name: "SetBorderTopWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BorderWidth", name: "BorderWidth", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBorderWidth", name: "SetBorderWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Bottom", name: "Bottom", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBottom", name: "SetBottom", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BoxShadow", name: "BoxShadow", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBoxShadow", name: "SetBoxShadow", pkg: "", typ: $funcType([$String], [], false)}, {prop: "BoxSizing", name: "BoxSizing", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetBoxSizing", name: "SetBoxSizing", pkg: "", typ: $funcType([$String], [], false)}, {prop: "CaptionSide", name: "CaptionSide", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetCaptionSide", name: "SetCaptionSide", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Clear", name: "Clear", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetClear", name: "SetClear", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Clip", name: "Clip", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetClip", name: "SetClip", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Color", name: "Color", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetColor", name: "SetColor", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ColumnCount", name: "ColumnCount", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetColumnCount", name: "SetColumnCount", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ColumnFill", name: "ColumnFill", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetColumnFill", name: "SetColumnFill", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ColumnGap", name: "ColumnGap", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetColumnGap", name: "SetColumnGap", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ColumnRule", name: "ColumnRule", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetColumnRule", name: "SetColumnRule", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ColumnRuleColor", name: "ColumnRuleColor", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetColumnRuleColor", name: "SetColumnRuleColor", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ColumnRuleStyle", name: "ColumnRuleStyle", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetColumnRuleStyle", name: "SetColumnRuleStyle", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ColumnRuleWidth", name: "ColumnRuleWidth", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetColumnRuleWidth", name: "SetColumnRuleWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Columns", name: "Columns", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetColumns", name: "SetColumns", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ColumnSpan", name: "ColumnSpan", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetColumnSpan", name: "SetColumnSpan", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ColumnWidth", name: "ColumnWidth", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetColumnWidth", name: "SetColumnWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "CounterIncrement", name: "CounterIncrement", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetCounterIncrement", name: "SetCounterIncrement", pkg: "", typ: $funcType([$String], [], false)}, {prop: "CounterReset", name: "CounterReset", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetCounterReset", name: "SetCounterReset", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Cursor", name: "Cursor", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetCursor", name: "SetCursor", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Direction", name: "Direction", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetDirection", name: "SetDirection", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Display", name: "Display", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetDisplay", name: "SetDisplay", pkg: "", typ: $funcType([$String], [], false)}, {prop: "EmptyCells", name: "EmptyCells", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetEmptyCells", name: "SetEmptyCells", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Filter", name: "Filter", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFilter", name: "SetFilter", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Flex", name: "Flex", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFlex", name: "SetFlex", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FlexBasis", name: "FlexBasis", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFlexBasis", name: "SetFlexBasis", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FlexDirection", name: "FlexDirection", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFlexDirection", name: "SetFlexDirection", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FlexFlow", name: "FlexFlow", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFlexFlow", name: "SetFlexFlow", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FlexGrow", name: "FlexGrow", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFlexGrow", name: "SetFlexGrow", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FlexShrink", name: "FlexShrink", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFlexShrink", name: "SetFlexShrink", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FlexWrap", name: "FlexWrap", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFlexWrap", name: "SetFlexWrap", pkg: "", typ: $funcType([$String], [], false)}, {prop: "CssFloat", name: "CssFloat", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetCssFloat", name: "SetCssFloat", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Font", name: "Font", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFont", name: "SetFont", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FontFamily", name: "FontFamily", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFontFamily", name: "SetFontFamily", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FontSize", name: "FontSize", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFontSize", name: "SetFontSize", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FontStyle", name: "FontStyle", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFontStyle", name: "SetFontStyle", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FontVariant", name: "FontVariant", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFontVariant", name: "SetFontVariant", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FontWeight", name: "FontWeight", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFontWeight", name: "SetFontWeight", pkg: "", typ: $funcType([$String], [], false)}, {prop: "FontSizeAdjust", name: "FontSizeAdjust", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetFontSizeAdjust", name: "SetFontSizeAdjust", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Height", name: "Height", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetHeight", name: "SetHeight", pkg: "", typ: $funcType([$String], [], false)}, {prop: "JustifyContent", name: "JustifyContent", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetJustifyContent", name: "SetJustifyContent", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Left", name: "Left", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetLeft", name: "SetLeft", pkg: "", typ: $funcType([$String], [], false)}, {prop: "LetterSpacing", name: "LetterSpacing", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetLetterSpacing", name: "SetLetterSpacing", pkg: "", typ: $funcType([$String], [], false)}, {prop: "LineHeight", name: "LineHeight", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetLineHeight", name: "SetLineHeight", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ListStyle", name: "ListStyle", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetListStyle", name: "SetListStyle", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ListStyleImage", name: "ListStyleImage", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetListStyleImage", name: "SetListStyleImage", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ListStylePosition", name: "ListStylePosition", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetListStylePosition", name: "SetListStylePosition", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ListStyleType", name: "ListStyleType", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetListStyleType", name: "SetListStyleType", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Margin", name: "Margin", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetMargin", name: "SetMargin", pkg: "", typ: $funcType([$String], [], false)}, {prop: "MarginBottom", name: "MarginBottom", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetMarginBottom", name: "SetMarginBottom", pkg: "", typ: $funcType([$String], [], false)}, {prop: "MarginLeft", name: "MarginLeft", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetMarginLeft", name: "SetMarginLeft", pkg: "", typ: $funcType([$String], [], false)}, {prop: "MarginRight", name: "MarginRight", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetMarginRight", name: "SetMarginRight", pkg: "", typ: $funcType([$String], [], false)}, {prop: "MarginTop", name: "MarginTop", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetMarginTop", name: "SetMarginTop", pkg: "", typ: $funcType([$String], [], false)}, {prop: "MaxHeight", name: "MaxHeight", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetMaxHeight", name: "SetMaxHeight", pkg: "", typ: $funcType([$String], [], false)}, {prop: "MaxWidth", name: "MaxWidth", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetMaxWidth", name: "SetMaxWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "MinHeight", name: "MinHeight", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetMinHeight", name: "SetMinHeight", pkg: "", typ: $funcType([$String], [], false)}, {prop: "MinWidth", name: "MinWidth", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetMinWidth", name: "SetMinWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Opacity", name: "Opacity", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOpacity", name: "SetOpacity", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Order", name: "Order", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOrder", name: "SetOrder", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Orphans", name: "Orphans", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOrphans", name: "SetOrphans", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Outline", name: "Outline", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOutline", name: "SetOutline", pkg: "", typ: $funcType([$String], [], false)}, {prop: "OutlineColor", name: "OutlineColor", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOutlineColor", name: "SetOutlineColor", pkg: "", typ: $funcType([$String], [], false)}, {prop: "OutlineOffset", name: "OutlineOffset", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOutlineOffset", name: "SetOutlineOffset", pkg: "", typ: $funcType([$String], [], false)}, {prop: "OutlineStyle", name: "OutlineStyle", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOutlineStyle", name: "SetOutlineStyle", pkg: "", typ: $funcType([$String], [], false)}, {prop: "OutlineWidth", name: "OutlineWidth", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOutlineWidth", name: "SetOutlineWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Overflow", name: "Overflow", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOverflow", name: "SetOverflow", pkg: "", typ: $funcType([$String], [], false)}, {prop: "OverflowX", name: "OverflowX", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOverflowX", name: "SetOverflowX", pkg: "", typ: $funcType([$String], [], false)}, {prop: "OverflowY", name: "OverflowY", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOverflowY", name: "SetOverflowY", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Padding", name: "Padding", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetPadding", name: "SetPadding", pkg: "", typ: $funcType([$String], [], false)}, {prop: "PaddingBottom", name: "PaddingBottom", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetPaddingBottom", name: "SetPaddingBottom", pkg: "", typ: $funcType([$String], [], false)}, {prop: "PaddingLeft", name: "PaddingLeft", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetPaddingLeft", name: "SetPaddingLeft", pkg: "", typ: $funcType([$String], [], false)}, {prop: "PaddingRight", name: "PaddingRight", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetPaddingRight", name: "SetPaddingRight", pkg: "", typ: $funcType([$String], [], false)}, {prop: "PaddingTop", name: "PaddingTop", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetPaddingTop", name: "SetPaddingTop", pkg: "", typ: $funcType([$String], [], false)}, {prop: "PageBreakAfter", name: "PageBreakAfter", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetPageBreakAfter", name: "SetPageBreakAfter", pkg: "", typ: $funcType([$String], [], false)}, {prop: "PageBreakBefore", name: "PageBreakBefore", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetPageBreakBefore", name: "SetPageBreakBefore", pkg: "", typ: $funcType([$String], [], false)}, {prop: "PageBreakInside", name: "PageBreakInside", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetPageBreakInside", name: "SetPageBreakInside", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Perspective", name: "Perspective", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetPerspective", name: "SetPerspective", pkg: "", typ: $funcType([$String], [], false)}, {prop: "PerspectiveOrigin", name: "PerspectiveOrigin", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetPerspectiveOrigin", name: "SetPerspectiveOrigin", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Position", name: "Position", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetPosition", name: "SetPosition", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Quotes", name: "Quotes", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetQuotes", name: "SetQuotes", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Resize", name: "Resize", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetResize", name: "SetResize", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Right", name: "Right", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetRight", name: "SetRight", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TableLayout", name: "TableLayout", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTableLayout", name: "SetTableLayout", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TabSize", name: "TabSize", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTabSize", name: "SetTabSize", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TextAlign", name: "TextAlign", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTextAlign", name: "SetTextAlign", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TextAlignLast", name: "TextAlignLast", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTextAlignLast", name: "SetTextAlignLast", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TextDecoration", name: "TextDecoration", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTextDecoration", name: "SetTextDecoration", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TextDecorationColor", name: "TextDecorationColor", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTextDecorationColor", name: "SetTextDecorationColor", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TextDecorationLine", name: "TextDecorationLine", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTextDecorationLine", name: "SetTextDecorationLine", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TextDecorationStyle", name: "TextDecorationStyle", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTextDecorationStyle", name: "SetTextDecorationStyle", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TextIndent", name: "TextIndent", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTextIndent", name: "SetTextIndent", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TextOverflow", name: "TextOverflow", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTextOverflow", name: "SetTextOverflow", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TextShadow", name: "TextShadow", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTextShadow", name: "SetTextShadow", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TextTransform", name: "TextTransform", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTextTransform", name: "SetTextTransform", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Top", name: "Top", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTop", name: "SetTop", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Transform", name: "Transform", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTransform", name: "SetTransform", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TransformOrigin", name: "TransformOrigin", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTransformOrigin", name: "SetTransformOrigin", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TransformStyle", name: "TransformStyle", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTransformStyle", name: "SetTransformStyle", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Transition", name: "Transition", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTransition", name: "SetTransition", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TransitionProperty", name: "TransitionProperty", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTransitionProperty", name: "SetTransitionProperty", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TransitionDuration", name: "TransitionDuration", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTransitionDuration", name: "SetTransitionDuration", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TransitionTimingFunction", name: "TransitionTimingFunction", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTransitionTimingFunction", name: "SetTransitionTimingFunction", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TransitionDelay", name: "TransitionDelay", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTransitionDelay", name: "SetTransitionDelay", pkg: "", typ: $funcType([$String], [], false)}, {prop: "UnicodeBidi", name: "UnicodeBidi", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetUnicodeBidi", name: "SetUnicodeBidi", pkg: "", typ: $funcType([$String], [], false)}, {prop: "UserSelect", name: "UserSelect", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetUserSelect", name: "SetUserSelect", pkg: "", typ: $funcType([$String], [], false)}, {prop: "VerticalAlign", name: "VerticalAlign", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetVerticalAlign", name: "SetVerticalAlign", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Visibility", name: "Visibility", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetVisibility", name: "SetVisibility", pkg: "", typ: $funcType([$String], [], false)}, {prop: "WhiteSpace", name: "WhiteSpace", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetWhiteSpace", name: "SetWhiteSpace", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Width", name: "Width", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetWidth", name: "SetWidth", pkg: "", typ: $funcType([$String], [], false)}, {prop: "WordBreak", name: "WordBreak", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetWordBreak", name: "SetWordBreak", pkg: "", typ: $funcType([$String], [], false)}, {prop: "WordSpacing", name: "WordSpacing", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetWordSpacing", name: "SetWordSpacing", pkg: "", typ: $funcType([$String], [], false)}, {prop: "WordWrap", name: "WordWrap", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetWordWrap", name: "SetWordWrap", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Widows", name: "Widows", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetWidows", name: "SetWidows", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ZIndex", name: "ZIndex", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetZIndex", name: "SetZIndex", pkg: "", typ: $funcType([$String], [], false)}];
	ptrType.methods = [{prop: "ActiveElement", name: "ActiveElement", pkg: "", typ: $funcType([], [ptrType], false)}, {prop: "CreateElement", name: "CreateElement", pkg: "", typ: $funcType([$String], [ptrType], false)}, {prop: "CreateTextNode", name: "CreateTextNode", pkg: "", typ: $funcType([$String], [ptrType], false)}, {prop: "GetElementById", name: "GetElementById", pkg: "", typ: $funcType([$String], [ptrType], false)}, {prop: "Write", name: "Write", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ClassList", name: "ClassList", pkg: "", typ: $funcType([], [ptrType$3], false)}, {prop: "InnerHTML", name: "InnerHTML", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetInnerHTML", name: "SetInnerHTML", pkg: "", typ: $funcType([$String], [], false)}, {prop: "OuterHTML", name: "OuterHTML", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetOuterHTML", name: "SetOuterHTML", pkg: "", typ: $funcType([$String], [], false)}, {prop: "TagName", name: "TagName", pkg: "", typ: $funcType([], [$String], false)}, {prop: "GetAttribute", name: "GetAttribute", pkg: "", typ: $funcType([$String], [$String], false)}, {prop: "GetBoundingClientRect", name: "GetBoundingClientRect", pkg: "", typ: $funcType([], [ptrType$4], false)}, {prop: "QuerySelector", name: "QuerySelector", pkg: "", typ: $funcType([$String], [ptrType], false)}, {prop: "QuerySelectorAll", name: "QuerySelectorAll", pkg: "", typ: $funcType([$String], [sliceType], false)}, {prop: "AddEventListener", name: "AddEventListener", pkg: "", typ: $funcType([$String, funcType, sliceType$1], [], true)}, {prop: "RemoveEventListener", name: "RemoveEventListener", pkg: "", typ: $funcType([$String, funcType, sliceType$1], [], true)}, {prop: "RemoveAllChildNodes", name: "RemoveAllChildNodes", pkg: "", typ: $funcType([], [], false)}, {prop: "AppendBefore", name: "AppendBefore", pkg: "", typ: $funcType([ptrType], [], false)}, {prop: "AppendAfter", name: "AppendAfter", pkg: "", typ: $funcType([ptrType], [], false)}, {prop: "IsFocused", name: "IsFocused", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Style", name: "Style", pkg: "", typ: $funcType([], [ptrType$1], false)}, {prop: "Dataset", name: "Dataset", pkg: "", typ: $funcType([], [ptrType], false)}, {prop: "Blur", name: "Blur", pkg: "", typ: $funcType([], [], false)}, {prop: "Focus", name: "Focus", pkg: "", typ: $funcType([], [], false)}, {prop: "Value", name: "Value", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetValue", name: "SetValue", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ChildNodes", name: "ChildNodes", pkg: "", typ: $funcType([], [sliceType], false)}, {prop: "FirstChild", name: "FirstChild", pkg: "", typ: $funcType([], [ptrType], false)}, {prop: "LastChild", name: "LastChild", pkg: "", typ: $funcType([], [ptrType], false)}, {prop: "NextSibling", name: "NextSibling", pkg: "", typ: $funcType([], [ptrType], false)}, {prop: "NodeType", name: "NodeType", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "NodeValue", name: "NodeValue", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetNodeValue", name: "SetNodeValue", pkg: "", typ: $funcType([$String], [], false)}, {prop: "ParentNode", name: "ParentNode", pkg: "", typ: $funcType([], [ptrType], false)}, {prop: "TextContent", name: "TextContent", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetTextContent", name: "SetTextContent", pkg: "", typ: $funcType([$String], [], false)}, {prop: "AppendChild", name: "AppendChild", pkg: "", typ: $funcType([ptrType], [], false)}, {prop: "HasChildNodes", name: "HasChildNodes", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "InsertBefore", name: "InsertBefore", pkg: "", typ: $funcType([ptrType, ptrType], [ptrType], false)}, {prop: "IsEqualNode", name: "IsEqualNode", pkg: "", typ: $funcType([ptrType], [$Bool], false)}, {prop: "IsSameNode", name: "IsSameNode", pkg: "", typ: $funcType([ptrType], [$Bool], false)}, {prop: "RemoveChild", name: "RemoveChild", pkg: "", typ: $funcType([ptrType], [ptrType], false)}];
	ptrType$4.methods = [{prop: "X", name: "X", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Y", name: "Y", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Width", name: "Width", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Height", name: "Height", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Top", name: "Top", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Right", name: "Right", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Bottom", name: "Bottom", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Left", name: "Left", pkg: "", typ: $funcType([], [$Float64], false)}];
	Event.methods = [{prop: "Target", name: "Target", pkg: "", typ: $funcType([], [ptrType], false)}, {prop: "PreventDefault", name: "PreventDefault", pkg: "", typ: $funcType([], [], false)}, {prop: "StopImmediatePropagation", name: "StopImmediatePropagation", pkg: "", typ: $funcType([], [], false)}, {prop: "StopPropagation", name: "StopPropagation", pkg: "", typ: $funcType([], [], false)}, {prop: "Key", name: "Key", pkg: "", typ: $funcType([], [$String], false)}, {prop: "KeyCode", name: "KeyCode", pkg: "", typ: $funcType([], [$Int], false)}];
	ptrType$3.methods = [{prop: "Length", name: "Length", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Contains", name: "Contains", pkg: "", typ: $funcType([$String], [$Bool], false)}, {prop: "Add", name: "Add", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Remove", name: "Remove", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Toggle", name: "Toggle", pkg: "", typ: $funcType([$String], [], false)}];
	CSSStyleDeclaration.init("", [{prop: "Object", name: "Object", embedded: true, exported: true, typ: ptrType$2, tag: ""}]);
	Object.init("", [{prop: "Object", name: "Object", embedded: true, exported: true, typ: ptrType$2, tag: ""}]);
	DOMRect.init("", [{prop: "Object", name: "Object", embedded: true, exported: true, typ: ptrType$2, tag: ""}]);
	Event.init("", [{prop: "Object", name: "Object", embedded: true, exported: true, typ: ptrType$2, tag: ""}]);
	DOMTokenList.init("", [{prop: "Object", name: "Object", embedded: true, exported: true, typ: ptrType$2, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$pkg.Document = new Object.ptr($global.document);
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["errors"] = (function() {
	var $pkg = {}, $init, errorString, ptrType, New;
	errorString = $pkg.errorString = $newType(0, $kindStruct, "errors.errorString", true, "errors", false, function(s_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.s = "";
			return;
		}
		this.s = s_;
	});
	ptrType = $ptrType(errorString);
	New = function(text) {
		var text;
		return new errorString.ptr(text);
	};
	$pkg.New = New;
	errorString.ptr.prototype.Error = function() {
		var e;
		e = this;
		return e.s;
	};
	errorString.prototype.Error = function() { return this.$val.Error(); };
	ptrType.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	errorString.init("errors", [{prop: "s", name: "s", embedded: false, exported: false, typ: $String, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["math/bits"] = (function() {
	var $pkg = {}, $init, deBruijn32tab, deBruijn64tab, len8tab, LeadingZeros64, TrailingZeros, TrailingZeros32, TrailingZeros64, Len64;
	LeadingZeros64 = function(x) {
		var x;
		return 64 - Len64(x) >> 0;
	};
	$pkg.LeadingZeros64 = LeadingZeros64;
	TrailingZeros = function(x) {
		var x;
		if (true) {
			return TrailingZeros32(((x >>> 0)));
		}
		return TrailingZeros64((new $Uint64(0, x)));
	};
	$pkg.TrailingZeros = TrailingZeros;
	TrailingZeros32 = function(x) {
		var x, x$1;
		if (x === 0) {
			return 32;
		}
		return (((x$1 = ($imul((((x & (-x >>> 0)) >>> 0)), 125613361) >>> 0) >>> 27 >>> 0, ((x$1 < 0 || x$1 >= deBruijn32tab.length) ? ($throwRuntimeError("index out of range"), undefined) : deBruijn32tab[x$1])) >> 0));
	};
	$pkg.TrailingZeros32 = TrailingZeros32;
	TrailingZeros64 = function(x) {
		var x, x$1, x$2;
		if ((x.$high === 0 && x.$low === 0)) {
			return 64;
		}
		return (((x$1 = $shiftRightUint64($mul64(((x$2 = new $Uint64(-x.$high, -x.$low), new $Uint64(x.$high & x$2.$high, (x.$low & x$2.$low) >>> 0))), new $Uint64(66559345, 3033172745)), 58), (($flatten64(x$1) < 0 || $flatten64(x$1) >= deBruijn64tab.length) ? ($throwRuntimeError("index out of range"), undefined) : deBruijn64tab[$flatten64(x$1)])) >> 0));
	};
	$pkg.TrailingZeros64 = TrailingZeros64;
	Len64 = function(x) {
		var n, x;
		n = 0;
		if ((x.$high > 1 || (x.$high === 1 && x.$low >= 0))) {
			x = $shiftRightUint64(x, (32));
			n = 32;
		}
		if ((x.$high > 0 || (x.$high === 0 && x.$low >= 65536))) {
			x = $shiftRightUint64(x, (16));
			n = n + (16) >> 0;
		}
		if ((x.$high > 0 || (x.$high === 0 && x.$low >= 256))) {
			x = $shiftRightUint64(x, (8));
			n = n + (8) >> 0;
		}
		n = n + (((($flatten64(x) < 0 || $flatten64(x) >= len8tab.length) ? ($throwRuntimeError("index out of range"), undefined) : len8tab[$flatten64(x)]) >> 0)) >> 0;
		return n;
	};
	$pkg.Len64 = Len64;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		deBruijn32tab = $toNativeArray($kindUint8, [0, 1, 28, 2, 29, 14, 24, 3, 30, 22, 20, 15, 25, 17, 4, 8, 31, 27, 13, 23, 21, 19, 16, 7, 26, 12, 18, 6, 11, 5, 10, 9]);
		deBruijn64tab = $toNativeArray($kindUint8, [0, 1, 56, 2, 57, 49, 28, 3, 61, 58, 42, 50, 38, 29, 17, 4, 62, 47, 59, 36, 45, 43, 51, 22, 53, 39, 33, 30, 24, 18, 12, 5, 63, 55, 48, 27, 60, 41, 37, 16, 46, 35, 44, 21, 52, 32, 23, 11, 54, 26, 40, 15, 34, 20, 31, 10, 25, 14, 19, 9, 13, 8, 7, 6]);
		len8tab = $toNativeArray($kindUint8, [0, 1, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8]);
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["math"] = (function() {
	var $pkg = {}, $init, js, bits, arrayType, arrayType$1, arrayType$2, structType, math, zero, nan, buf, Exp, Log, init, Float32bits, Float64bits;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	bits = $packages["math/bits"];
	arrayType = $arrayType($Uint32, 2);
	arrayType$1 = $arrayType($Float32, 2);
	arrayType$2 = $arrayType($Float64, 1);
	structType = $structType("math", [{prop: "uint32array", name: "uint32array", embedded: false, exported: false, typ: arrayType, tag: ""}, {prop: "float32array", name: "float32array", embedded: false, exported: false, typ: arrayType$1, tag: ""}, {prop: "float64array", name: "float64array", embedded: false, exported: false, typ: arrayType$2, tag: ""}]);
	Exp = function(x) {
		var x;
		return $parseFloat(math.exp(x));
	};
	$pkg.Exp = Exp;
	Log = function(x) {
		var x;
		if (!((x === x))) {
			return nan;
		}
		return $parseFloat(math.log(x));
	};
	$pkg.Log = Log;
	init = function() {
		var ab;
		ab = new ($global.ArrayBuffer)(8);
		buf.uint32array = new ($global.Uint32Array)(ab);
		buf.float32array = new ($global.Float32Array)(ab);
		buf.float64array = new ($global.Float64Array)(ab);
	};
	Float32bits = function(f) {
		var f;
		buf.float32array[0] = f;
		return buf.uint32array[0];
	};
	$pkg.Float32bits = Float32bits;
	Float64bits = function(f) {
		var f, x, x$1;
		buf.float64array[0] = f;
		return (x = $shiftLeft64((new $Uint64(0, buf.uint32array[1])), 32), x$1 = (new $Uint64(0, buf.uint32array[0])), new $Uint64(x.$high + x$1.$high, x.$low + x$1.$low));
	};
	$pkg.Float64bits = Float64bits;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = bits.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		buf = new structType.ptr(arrayType.zero(), arrayType$1.zero(), arrayType$2.zero());
		math = $global.Math;
		zero = 0;
		nan = 0 / zero;
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["unicode/utf8"] = (function() {
	var $pkg = {}, $init, acceptRange, first, acceptRanges, DecodeRuneInString, DecodeLastRuneInString, RuneStart;
	acceptRange = $pkg.acceptRange = $newType(0, $kindStruct, "utf8.acceptRange", true, "unicode/utf8", false, function(lo_, hi_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.lo = 0;
			this.hi = 0;
			return;
		}
		this.lo = lo_;
		this.hi = hi_;
	});
	DecodeRuneInString = function(s) {
		var _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, accept, mask, n, r, s, s0, s1, s2, s3, size, sz, x, x$1;
		r = 0;
		size = 0;
		n = s.length;
		if (n < 1) {
			_tmp = 65533;
			_tmp$1 = 0;
			r = _tmp;
			size = _tmp$1;
			return [r, size];
		}
		s0 = s.charCodeAt(0);
		x = ((s0 < 0 || s0 >= first.length) ? ($throwRuntimeError("index out of range"), undefined) : first[s0]);
		if (x >= 240) {
			mask = (((x >> 0)) << 31 >> 0) >> 31 >> 0;
			_tmp$2 = ((((s.charCodeAt(0) >> 0)) & ~mask) >> 0) | (65533 & mask);
			_tmp$3 = 1;
			r = _tmp$2;
			size = _tmp$3;
			return [r, size];
		}
		sz = (x & 7) >>> 0;
		accept = $clone((x$1 = x >>> 4 << 24 >>> 24, ((x$1 < 0 || x$1 >= acceptRanges.length) ? ($throwRuntimeError("index out of range"), undefined) : acceptRanges[x$1])), acceptRange);
		if (n < ((sz >> 0))) {
			_tmp$4 = 65533;
			_tmp$5 = 1;
			r = _tmp$4;
			size = _tmp$5;
			return [r, size];
		}
		s1 = s.charCodeAt(1);
		if (s1 < accept.lo || accept.hi < s1) {
			_tmp$6 = 65533;
			_tmp$7 = 1;
			r = _tmp$6;
			size = _tmp$7;
			return [r, size];
		}
		if (sz === 2) {
			_tmp$8 = (((((s0 & 31) >>> 0) >> 0)) << 6 >> 0) | ((((s1 & 63) >>> 0) >> 0));
			_tmp$9 = 2;
			r = _tmp$8;
			size = _tmp$9;
			return [r, size];
		}
		s2 = s.charCodeAt(2);
		if (s2 < 128 || 191 < s2) {
			_tmp$10 = 65533;
			_tmp$11 = 1;
			r = _tmp$10;
			size = _tmp$11;
			return [r, size];
		}
		if (sz === 3) {
			_tmp$12 = ((((((s0 & 15) >>> 0) >> 0)) << 12 >> 0) | (((((s1 & 63) >>> 0) >> 0)) << 6 >> 0)) | ((((s2 & 63) >>> 0) >> 0));
			_tmp$13 = 3;
			r = _tmp$12;
			size = _tmp$13;
			return [r, size];
		}
		s3 = s.charCodeAt(3);
		if (s3 < 128 || 191 < s3) {
			_tmp$14 = 65533;
			_tmp$15 = 1;
			r = _tmp$14;
			size = _tmp$15;
			return [r, size];
		}
		_tmp$16 = (((((((s0 & 7) >>> 0) >> 0)) << 18 >> 0) | (((((s1 & 63) >>> 0) >> 0)) << 12 >> 0)) | (((((s2 & 63) >>> 0) >> 0)) << 6 >> 0)) | ((((s3 & 63) >>> 0) >> 0));
		_tmp$17 = 4;
		r = _tmp$16;
		size = _tmp$17;
		return [r, size];
	};
	$pkg.DecodeRuneInString = DecodeRuneInString;
	DecodeLastRuneInString = function(s) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tuple, end, lim, r, s, size, start;
		r = 0;
		size = 0;
		end = s.length;
		if (end === 0) {
			_tmp = 65533;
			_tmp$1 = 0;
			r = _tmp;
			size = _tmp$1;
			return [r, size];
		}
		start = end - 1 >> 0;
		r = ((s.charCodeAt(start) >> 0));
		if (r < 128) {
			_tmp$2 = r;
			_tmp$3 = 1;
			r = _tmp$2;
			size = _tmp$3;
			return [r, size];
		}
		lim = end - 4 >> 0;
		if (lim < 0) {
			lim = 0;
		}
		start = start - (1) >> 0;
		while (true) {
			if (!(start >= lim)) { break; }
			if (RuneStart(s.charCodeAt(start))) {
				break;
			}
			start = start - (1) >> 0;
		}
		if (start < 0) {
			start = 0;
		}
		_tuple = DecodeRuneInString($substring(s, start, end));
		r = _tuple[0];
		size = _tuple[1];
		if (!(((start + size >> 0) === end))) {
			_tmp$4 = 65533;
			_tmp$5 = 1;
			r = _tmp$4;
			size = _tmp$5;
			return [r, size];
		}
		_tmp$6 = r;
		_tmp$7 = size;
		r = _tmp$6;
		size = _tmp$7;
		return [r, size];
	};
	$pkg.DecodeLastRuneInString = DecodeLastRuneInString;
	RuneStart = function(b) {
		var b;
		return !((((b & 192) >>> 0) === 128));
	};
	$pkg.RuneStart = RuneStart;
	acceptRange.init("unicode/utf8", [{prop: "lo", name: "lo", embedded: false, exported: false, typ: $Uint8, tag: ""}, {prop: "hi", name: "hi", embedded: false, exported: false, typ: $Uint8, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		first = $toNativeArray($kindUint8, [240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 19, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 35, 3, 3, 52, 4, 4, 4, 68, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241]);
		acceptRanges = $toNativeArray($kindStruct, [new acceptRange.ptr(128, 191), new acceptRange.ptr(160, 191), new acceptRange.ptr(128, 159), new acceptRange.ptr(144, 191), new acceptRange.ptr(128, 143)]);
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["strconv"] = (function() {
	var $pkg = {}, $init, errors, bytealg, math, bits, utf8, decimal, leftCheat, extFloat, floatInfo, decimalSlice, sliceType$3, arrayType, sliceType$6, arrayType$1, arrayType$2, ptrType$1, arrayType$3, ptrType$2, ptrType$3, ptrType$4, optimize, leftcheats, smallPowersOfTen, powersOfTen, uint64pow10, float32info, float32info$24ptr, float64info, float64info$24ptr, digitZero, trim, rightShift, prefixIsLessThan, leftShift, shouldRoundUp, frexp10Many, adjustLastDigitFixed, adjustLastDigit, FormatFloat, genericFtoa, bigFtoa, formatDigits, roundShortest, fmtE, fmtF, fmtB, min, max, formatBits, isPowerOfTwo;
	errors = $packages["errors"];
	bytealg = $packages["internal/bytealg"];
	math = $packages["math"];
	bits = $packages["math/bits"];
	utf8 = $packages["unicode/utf8"];
	decimal = $pkg.decimal = $newType(0, $kindStruct, "strconv.decimal", true, "strconv", false, function(d_, nd_, dp_, neg_, trunc_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.d = arrayType.zero();
			this.nd = 0;
			this.dp = 0;
			this.neg = false;
			this.trunc = false;
			return;
		}
		this.d = d_;
		this.nd = nd_;
		this.dp = dp_;
		this.neg = neg_;
		this.trunc = trunc_;
	});
	leftCheat = $pkg.leftCheat = $newType(0, $kindStruct, "strconv.leftCheat", true, "strconv", false, function(delta_, cutoff_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.delta = 0;
			this.cutoff = "";
			return;
		}
		this.delta = delta_;
		this.cutoff = cutoff_;
	});
	extFloat = $pkg.extFloat = $newType(0, $kindStruct, "strconv.extFloat", true, "strconv", false, function(mant_, exp_, neg_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.mant = new $Uint64(0, 0);
			this.exp = 0;
			this.neg = false;
			return;
		}
		this.mant = mant_;
		this.exp = exp_;
		this.neg = neg_;
	});
	floatInfo = $pkg.floatInfo = $newType(0, $kindStruct, "strconv.floatInfo", true, "strconv", false, function(mantbits_, expbits_, bias_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.mantbits = 0;
			this.expbits = 0;
			this.bias = 0;
			return;
		}
		this.mantbits = mantbits_;
		this.expbits = expbits_;
		this.bias = bias_;
	});
	decimalSlice = $pkg.decimalSlice = $newType(0, $kindStruct, "strconv.decimalSlice", true, "strconv", false, function(d_, nd_, dp_, neg_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.d = sliceType$6.nil;
			this.nd = 0;
			this.dp = 0;
			this.neg = false;
			return;
		}
		this.d = d_;
		this.nd = nd_;
		this.dp = dp_;
		this.neg = neg_;
	});
	sliceType$3 = $sliceType(leftCheat);
	arrayType = $arrayType($Uint8, 800);
	sliceType$6 = $sliceType($Uint8);
	arrayType$1 = $arrayType($Uint8, 24);
	arrayType$2 = $arrayType($Uint8, 32);
	ptrType$1 = $ptrType(floatInfo);
	arrayType$3 = $arrayType($Uint8, 65);
	ptrType$2 = $ptrType(decimal);
	ptrType$3 = $ptrType(decimalSlice);
	ptrType$4 = $ptrType(extFloat);
	decimal.ptr.prototype.String = function() {
		var a, buf, n, w;
		a = this;
		n = 10 + a.nd >> 0;
		if (a.dp > 0) {
			n = n + (a.dp) >> 0;
		}
		if (a.dp < 0) {
			n = n + (-a.dp) >> 0;
		}
		buf = $makeSlice(sliceType$6, n);
		w = 0;
		if ((a.nd === 0)) {
			return "0";
		} else if (a.dp <= 0) {
			((w < 0 || w >= buf.$length) ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + w] = 48);
			w = w + (1) >> 0;
			((w < 0 || w >= buf.$length) ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + w] = 46);
			w = w + (1) >> 0;
			w = w + (digitZero($subslice(buf, w, (w + -a.dp >> 0)))) >> 0;
			w = w + ($copySlice($subslice(buf, w), $subslice(new sliceType$6(a.d), 0, a.nd))) >> 0;
		} else if (a.dp < a.nd) {
			w = w + ($copySlice($subslice(buf, w), $subslice(new sliceType$6(a.d), 0, a.dp))) >> 0;
			((w < 0 || w >= buf.$length) ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + w] = 46);
			w = w + (1) >> 0;
			w = w + ($copySlice($subslice(buf, w), $subslice(new sliceType$6(a.d), a.dp, a.nd))) >> 0;
		} else {
			w = w + ($copySlice($subslice(buf, w), $subslice(new sliceType$6(a.d), 0, a.nd))) >> 0;
			w = w + (digitZero($subslice(buf, w, ((w + a.dp >> 0) - a.nd >> 0)))) >> 0;
		}
		return ($bytesToString($subslice(buf, 0, w)));
	};
	decimal.prototype.String = function() { return this.$val.String(); };
	digitZero = function(dst) {
		var _i, _ref, dst, i;
		_ref = dst;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			((i < 0 || i >= dst.$length) ? ($throwRuntimeError("index out of range"), undefined) : dst.$array[dst.$offset + i] = 48);
			_i++;
		}
		return dst.$length;
	};
	trim = function(a) {
		var a, x, x$1;
		while (true) {
			if (!(a.nd > 0 && ((x = a.d, x$1 = a.nd - 1 >> 0, ((x$1 < 0 || x$1 >= x.length) ? ($throwRuntimeError("index out of range"), undefined) : x[x$1])) === 48))) { break; }
			a.nd = a.nd - (1) >> 0;
		}
		if (a.nd === 0) {
			a.dp = 0;
		}
	};
	decimal.ptr.prototype.Assign = function(v) {
		var a, buf, n, v, v1, x, x$1, x$2;
		a = this;
		buf = arrayType$1.zero();
		n = 0;
		while (true) {
			if (!((v.$high > 0 || (v.$high === 0 && v.$low > 0)))) { break; }
			v1 = $div64(v, new $Uint64(0, 10), false);
			v = (x = $mul64(new $Uint64(0, 10), v1), new $Uint64(v.$high - x.$high, v.$low - x.$low));
			((n < 0 || n >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[n] = ((new $Uint64(v.$high + 0, v.$low + 48).$low << 24 >>> 24)));
			n = n + (1) >> 0;
			v = v1;
		}
		a.nd = 0;
		n = n - (1) >> 0;
		while (true) {
			if (!(n >= 0)) { break; }
			(x$1 = a.d, x$2 = a.nd, ((x$2 < 0 || x$2 >= x$1.length) ? ($throwRuntimeError("index out of range"), undefined) : x$1[x$2] = ((n < 0 || n >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[n])));
			a.nd = a.nd + (1) >> 0;
			n = n - (1) >> 0;
		}
		a.dp = a.nd;
		trim(a);
	};
	decimal.prototype.Assign = function(v) { return this.$val.Assign(v); };
	rightShift = function(a, k) {
		var a, c, c$1, dig, dig$1, k, mask, n, r, w, x, x$1, x$2, x$3, y, y$1, y$2, y$3, y$4;
		r = 0;
		w = 0;
		n = 0;
		while (true) {
			if (!(((y = k, y < 32 ? (n >>> y) : 0) >>> 0) === 0)) { break; }
			if (r >= a.nd) {
				if (n === 0) {
					a.nd = 0;
					return;
				}
				while (true) {
					if (!(((y$1 = k, y$1 < 32 ? (n >>> y$1) : 0) >>> 0) === 0)) { break; }
					n = n * 10 >>> 0;
					r = r + (1) >> 0;
				}
				break;
			}
			c = (((x = a.d, ((r < 0 || r >= x.length) ? ($throwRuntimeError("index out of range"), undefined) : x[r])) >>> 0));
			n = ((n * 10 >>> 0) + c >>> 0) - 48 >>> 0;
			r = r + (1) >> 0;
		}
		a.dp = a.dp - ((r - 1 >> 0)) >> 0;
		mask = (((y$2 = k, y$2 < 32 ? (1 << y$2) : 0) >>> 0)) - 1 >>> 0;
		while (true) {
			if (!(r < a.nd)) { break; }
			c$1 = (((x$1 = a.d, ((r < 0 || r >= x$1.length) ? ($throwRuntimeError("index out of range"), undefined) : x$1[r])) >>> 0));
			dig = (y$3 = k, y$3 < 32 ? (n >>> y$3) : 0) >>> 0;
			n = (n & (mask)) >>> 0;
			(x$2 = a.d, ((w < 0 || w >= x$2.length) ? ($throwRuntimeError("index out of range"), undefined) : x$2[w] = (((dig + 48 >>> 0) << 24 >>> 24))));
			w = w + (1) >> 0;
			n = ((n * 10 >>> 0) + c$1 >>> 0) - 48 >>> 0;
			r = r + (1) >> 0;
		}
		while (true) {
			if (!(n > 0)) { break; }
			dig$1 = (y$4 = k, y$4 < 32 ? (n >>> y$4) : 0) >>> 0;
			n = (n & (mask)) >>> 0;
			if (w < 800) {
				(x$3 = a.d, ((w < 0 || w >= x$3.length) ? ($throwRuntimeError("index out of range"), undefined) : x$3[w] = (((dig$1 + 48 >>> 0) << 24 >>> 24))));
				w = w + (1) >> 0;
			} else if (dig$1 > 0) {
				a.trunc = true;
			}
			n = n * 10 >>> 0;
		}
		a.nd = w;
		trim(a);
	};
	prefixIsLessThan = function(b, s) {
		var b, i, s;
		i = 0;
		while (true) {
			if (!(i < s.length)) { break; }
			if (i >= b.$length) {
				return true;
			}
			if (!((((i < 0 || i >= b.$length) ? ($throwRuntimeError("index out of range"), undefined) : b.$array[b.$offset + i]) === s.charCodeAt(i)))) {
				return ((i < 0 || i >= b.$length) ? ($throwRuntimeError("index out of range"), undefined) : b.$array[b.$offset + i]) < s.charCodeAt(i);
			}
			i = i + (1) >> 0;
		}
		return false;
	};
	leftShift = function(a, k) {
		var _q, _q$1, a, delta, k, n, quo, quo$1, r, rem, rem$1, w, x, x$1, x$2, y;
		delta = ((k < 0 || k >= leftcheats.$length) ? ($throwRuntimeError("index out of range"), undefined) : leftcheats.$array[leftcheats.$offset + k]).delta;
		if (prefixIsLessThan($subslice(new sliceType$6(a.d), 0, a.nd), ((k < 0 || k >= leftcheats.$length) ? ($throwRuntimeError("index out of range"), undefined) : leftcheats.$array[leftcheats.$offset + k]).cutoff)) {
			delta = delta - (1) >> 0;
		}
		r = a.nd;
		w = a.nd + delta >> 0;
		n = 0;
		r = r - (1) >> 0;
		while (true) {
			if (!(r >= 0)) { break; }
			n = n + (((y = k, y < 32 ? ((((((x = a.d, ((r < 0 || r >= x.length) ? ($throwRuntimeError("index out of range"), undefined) : x[r])) >>> 0)) - 48 >>> 0)) << y) : 0) >>> 0)) >>> 0;
			quo = (_q = n / 10, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
			rem = n - (10 * quo >>> 0) >>> 0;
			w = w - (1) >> 0;
			if (w < 800) {
				(x$1 = a.d, ((w < 0 || w >= x$1.length) ? ($throwRuntimeError("index out of range"), undefined) : x$1[w] = (((rem + 48 >>> 0) << 24 >>> 24))));
			} else if (!((rem === 0))) {
				a.trunc = true;
			}
			n = quo;
			r = r - (1) >> 0;
		}
		while (true) {
			if (!(n > 0)) { break; }
			quo$1 = (_q$1 = n / 10, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >>> 0 : $throwRuntimeError("integer divide by zero"));
			rem$1 = n - (10 * quo$1 >>> 0) >>> 0;
			w = w - (1) >> 0;
			if (w < 800) {
				(x$2 = a.d, ((w < 0 || w >= x$2.length) ? ($throwRuntimeError("index out of range"), undefined) : x$2[w] = (((rem$1 + 48 >>> 0) << 24 >>> 24))));
			} else if (!((rem$1 === 0))) {
				a.trunc = true;
			}
			n = quo$1;
		}
		a.nd = a.nd + (delta) >> 0;
		if (a.nd >= 800) {
			a.nd = 800;
		}
		a.dp = a.dp + (delta) >> 0;
		trim(a);
	};
	decimal.ptr.prototype.Shift = function(k) {
		var a, k;
		a = this;
		if ((a.nd === 0)) {
		} else if (k > 0) {
			while (true) {
				if (!(k > 28)) { break; }
				leftShift(a, 28);
				k = k - (28) >> 0;
			}
			leftShift(a, ((k >>> 0)));
		} else if (k < 0) {
			while (true) {
				if (!(k < -28)) { break; }
				rightShift(a, 28);
				k = k + (28) >> 0;
			}
			rightShift(a, ((-k >>> 0)));
		}
	};
	decimal.prototype.Shift = function(k) { return this.$val.Shift(k); };
	shouldRoundUp = function(a, nd) {
		var _r, a, nd, x, x$1, x$2, x$3;
		if (nd < 0 || nd >= a.nd) {
			return false;
		}
		if (((x = a.d, ((nd < 0 || nd >= x.length) ? ($throwRuntimeError("index out of range"), undefined) : x[nd])) === 53) && ((nd + 1 >> 0) === a.nd)) {
			if (a.trunc) {
				return true;
			}
			return nd > 0 && !(((_r = (((x$1 = a.d, x$2 = nd - 1 >> 0, ((x$2 < 0 || x$2 >= x$1.length) ? ($throwRuntimeError("index out of range"), undefined) : x$1[x$2])) - 48 << 24 >>> 24)) % 2, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) === 0));
		}
		return (x$3 = a.d, ((nd < 0 || nd >= x$3.length) ? ($throwRuntimeError("index out of range"), undefined) : x$3[nd])) >= 53;
	};
	decimal.ptr.prototype.Round = function(nd) {
		var a, nd;
		a = this;
		if (nd < 0 || nd >= a.nd) {
			return;
		}
		if (shouldRoundUp(a, nd)) {
			a.RoundUp(nd);
		} else {
			a.RoundDown(nd);
		}
	};
	decimal.prototype.Round = function(nd) { return this.$val.Round(nd); };
	decimal.ptr.prototype.RoundDown = function(nd) {
		var a, nd;
		a = this;
		if (nd < 0 || nd >= a.nd) {
			return;
		}
		a.nd = nd;
		trim(a);
	};
	decimal.prototype.RoundDown = function(nd) { return this.$val.RoundDown(nd); };
	decimal.ptr.prototype.RoundUp = function(nd) {
		var a, c, i, nd, x, x$1, x$2;
		a = this;
		if (nd < 0 || nd >= a.nd) {
			return;
		}
		i = nd - 1 >> 0;
		while (true) {
			if (!(i >= 0)) { break; }
			c = (x = a.d, ((i < 0 || i >= x.length) ? ($throwRuntimeError("index out of range"), undefined) : x[i]));
			if (c < 57) {
				(x$2 = a.d, ((i < 0 || i >= x$2.length) ? ($throwRuntimeError("index out of range"), undefined) : x$2[i] = ((x$1 = a.d, ((i < 0 || i >= x$1.length) ? ($throwRuntimeError("index out of range"), undefined) : x$1[i])) + (1) << 24 >>> 24)));
				a.nd = i + 1 >> 0;
				return;
			}
			i = i - (1) >> 0;
		}
		a.d[0] = 49;
		a.nd = 1;
		a.dp = a.dp + (1) >> 0;
	};
	decimal.prototype.RoundUp = function(nd) { return this.$val.RoundUp(nd); };
	decimal.ptr.prototype.RoundedInteger = function() {
		var a, i, n, x, x$1, x$2, x$3;
		a = this;
		if (a.dp > 20) {
			return new $Uint64(4294967295, 4294967295);
		}
		i = 0;
		n = new $Uint64(0, 0);
		i = 0;
		while (true) {
			if (!(i < a.dp && i < a.nd)) { break; }
			n = (x = $mul64(n, new $Uint64(0, 10)), x$1 = (new $Uint64(0, ((x$2 = a.d, ((i < 0 || i >= x$2.length) ? ($throwRuntimeError("index out of range"), undefined) : x$2[i])) - 48 << 24 >>> 24))), new $Uint64(x.$high + x$1.$high, x.$low + x$1.$low));
			i = i + (1) >> 0;
		}
		while (true) {
			if (!(i < a.dp)) { break; }
			n = $mul64(n, (new $Uint64(0, 10)));
			i = i + (1) >> 0;
		}
		if (shouldRoundUp(a, a.dp)) {
			n = (x$3 = new $Uint64(0, 1), new $Uint64(n.$high + x$3.$high, n.$low + x$3.$low));
		}
		return n;
	};
	decimal.prototype.RoundedInteger = function() { return this.$val.RoundedInteger(); };
	extFloat.ptr.prototype.AssignComputeBounds = function(mant, exp, neg, flt) {
		var _tmp, _tmp$1, exp, expBiased, f, flt, lower, mant, neg, upper, x, x$1, x$2, x$3, x$4;
		lower = new extFloat.ptr(new $Uint64(0, 0), 0, false);
		upper = new extFloat.ptr(new $Uint64(0, 0), 0, false);
		f = this;
		f.mant = mant;
		f.exp = exp - ((flt.mantbits >> 0)) >> 0;
		f.neg = neg;
		if (f.exp <= 0 && (x = $shiftLeft64(($shiftRightUint64(mant, ((-f.exp >>> 0)))), ((-f.exp >>> 0))), (mant.$high === x.$high && mant.$low === x.$low))) {
			f.mant = $shiftRightUint64(f.mant, (((-f.exp >>> 0))));
			f.exp = 0;
			_tmp = $clone(f, extFloat);
			_tmp$1 = $clone(f, extFloat);
			extFloat.copy(lower, _tmp);
			extFloat.copy(upper, _tmp$1);
			return [lower, upper];
		}
		expBiased = exp - flt.bias >> 0;
		extFloat.copy(upper, new extFloat.ptr((x$1 = $mul64(new $Uint64(0, 2), f.mant), new $Uint64(x$1.$high + 0, x$1.$low + 1)), f.exp - 1 >> 0, f.neg));
		if (!((x$2 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), (mant.$high === x$2.$high && mant.$low === x$2.$low))) || (expBiased === 1)) {
			extFloat.copy(lower, new extFloat.ptr((x$3 = $mul64(new $Uint64(0, 2), f.mant), new $Uint64(x$3.$high - 0, x$3.$low - 1)), f.exp - 1 >> 0, f.neg));
		} else {
			extFloat.copy(lower, new extFloat.ptr((x$4 = $mul64(new $Uint64(0, 4), f.mant), new $Uint64(x$4.$high - 0, x$4.$low - 1)), f.exp - 2 >> 0, f.neg));
		}
		return [lower, upper];
	};
	extFloat.prototype.AssignComputeBounds = function(mant, exp, neg, flt) { return this.$val.AssignComputeBounds(mant, exp, neg, flt); };
	extFloat.ptr.prototype.Normalize = function() {
		var f, shift, x;
		f = this;
		if ((x = f.mant, (x.$high === 0 && x.$low === 0))) {
			return 0;
		}
		shift = bits.LeadingZeros64(f.mant);
		f.mant = $shiftLeft64(f.mant, (((shift >>> 0))));
		f.exp = f.exp - (shift) >> 0;
		return ((shift >>> 0));
	};
	extFloat.prototype.Normalize = function() { return this.$val.Normalize(); };
	extFloat.ptr.prototype.Multiply = function(g) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, cross1, cross2, f, fhi, flo, g, ghi, glo, rem, x, x$1, x$10, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		f = this;
		_tmp = $shiftRightUint64(f.mant, 32);
		_tmp$1 = (new $Uint64(0, ((f.mant.$low >>> 0))));
		fhi = _tmp;
		flo = _tmp$1;
		_tmp$2 = $shiftRightUint64(g.mant, 32);
		_tmp$3 = (new $Uint64(0, ((g.mant.$low >>> 0))));
		ghi = _tmp$2;
		glo = _tmp$3;
		cross1 = $mul64(fhi, glo);
		cross2 = $mul64(flo, ghi);
		f.mant = (x = (x$1 = $mul64(fhi, ghi), x$2 = $shiftRightUint64(cross1, 32), new $Uint64(x$1.$high + x$2.$high, x$1.$low + x$2.$low)), x$3 = $shiftRightUint64(cross2, 32), new $Uint64(x.$high + x$3.$high, x.$low + x$3.$low));
		rem = (x$4 = (x$5 = (new $Uint64(0, ((cross1.$low >>> 0)))), x$6 = (new $Uint64(0, ((cross2.$low >>> 0)))), new $Uint64(x$5.$high + x$6.$high, x$5.$low + x$6.$low)), x$7 = $shiftRightUint64(($mul64(flo, glo)), 32), new $Uint64(x$4.$high + x$7.$high, x$4.$low + x$7.$low));
		rem = (x$8 = new $Uint64(0, 2147483648), new $Uint64(rem.$high + x$8.$high, rem.$low + x$8.$low));
		f.mant = (x$9 = f.mant, x$10 = ($shiftRightUint64(rem, 32)), new $Uint64(x$9.$high + x$10.$high, x$9.$low + x$10.$low));
		f.exp = (f.exp + g.exp >> 0) + 64 >> 0;
	};
	extFloat.prototype.Multiply = function(g) { return this.$val.Multiply(g); };
	extFloat.ptr.prototype.AssignDecimal = function(mantissa, exp10, neg, trunc, flt) {
		var _q, _r, adjExp, denormalExp, errors$1, exp10, extrabits, f, flt, halfway, i, mant_extra, mantissa, neg, ok, shift, trunc, x, x$1, x$10, x$11, x$12, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, y;
		ok = false;
		f = this;
		errors$1 = 0;
		if (trunc) {
			errors$1 = errors$1 + (4) >> 0;
		}
		f.mant = mantissa;
		f.exp = 0;
		f.neg = neg;
		i = (_q = ((exp10 - -348 >> 0)) / 8, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		if (exp10 < -348 || i >= 87) {
			ok = false;
			return ok;
		}
		adjExp = (_r = ((exp10 - -348 >> 0)) % 8, _r === _r ? _r : $throwRuntimeError("integer divide by zero"));
		if (adjExp < 19 && (x = (x$1 = 19 - adjExp >> 0, ((x$1 < 0 || x$1 >= uint64pow10.length) ? ($throwRuntimeError("index out of range"), undefined) : uint64pow10[x$1])), (mantissa.$high < x.$high || (mantissa.$high === x.$high && mantissa.$low < x.$low)))) {
			f.mant = $mul64(f.mant, (((adjExp < 0 || adjExp >= uint64pow10.length) ? ($throwRuntimeError("index out of range"), undefined) : uint64pow10[adjExp])));
			f.Normalize();
		} else {
			f.Normalize();
			f.Multiply($clone(((adjExp < 0 || adjExp >= smallPowersOfTen.length) ? ($throwRuntimeError("index out of range"), undefined) : smallPowersOfTen[adjExp]), extFloat));
			errors$1 = errors$1 + (4) >> 0;
		}
		f.Multiply($clone(((i < 0 || i >= powersOfTen.length) ? ($throwRuntimeError("index out of range"), undefined) : powersOfTen[i]), extFloat));
		if (errors$1 > 0) {
			errors$1 = errors$1 + (1) >> 0;
		}
		errors$1 = errors$1 + (4) >> 0;
		shift = f.Normalize();
		errors$1 = (y = (shift), y < 32 ? (errors$1 << y) : 0) >> 0;
		denormalExp = flt.bias - 63 >> 0;
		extrabits = 0;
		if (f.exp <= denormalExp) {
			extrabits = ((63 - flt.mantbits >>> 0) + 1 >>> 0) + (((denormalExp - f.exp >> 0) >>> 0)) >>> 0;
		} else {
			extrabits = 63 - flt.mantbits >>> 0;
		}
		halfway = $shiftLeft64(new $Uint64(0, 1), ((extrabits - 1 >>> 0)));
		mant_extra = (x$2 = f.mant, x$3 = (x$4 = $shiftLeft64(new $Uint64(0, 1), extrabits), new $Uint64(x$4.$high - 0, x$4.$low - 1)), new $Uint64(x$2.$high & x$3.$high, (x$2.$low & x$3.$low) >>> 0));
		if ((x$5 = (x$6 = (new $Int64(halfway.$high, halfway.$low)), x$7 = (new $Int64(0, errors$1)), new $Int64(x$6.$high - x$7.$high, x$6.$low - x$7.$low)), x$8 = (new $Int64(mant_extra.$high, mant_extra.$low)), (x$5.$high < x$8.$high || (x$5.$high === x$8.$high && x$5.$low < x$8.$low))) && (x$9 = (new $Int64(mant_extra.$high, mant_extra.$low)), x$10 = (x$11 = (new $Int64(halfway.$high, halfway.$low)), x$12 = (new $Int64(0, errors$1)), new $Int64(x$11.$high + x$12.$high, x$11.$low + x$12.$low)), (x$9.$high < x$10.$high || (x$9.$high === x$10.$high && x$9.$low < x$10.$low)))) {
			ok = false;
			return ok;
		}
		ok = true;
		return ok;
	};
	extFloat.prototype.AssignDecimal = function(mantissa, exp10, neg, trunc, flt) { return this.$val.AssignDecimal(mantissa, exp10, neg, trunc, flt); };
	extFloat.ptr.prototype.frexp10 = function() {
		var _q, _q$1, _tmp, _tmp$1, approxExp10, exp, exp10, f, i, index;
		exp10 = 0;
		index = 0;
		f = this;
		approxExp10 = (_q = ($imul(((-46 - f.exp >> 0)), 28)) / 93, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		i = (_q$1 = ((approxExp10 - -348 >> 0)) / 8, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero"));
		Loop:
		while (true) {
			exp = (f.exp + ((i < 0 || i >= powersOfTen.length) ? ($throwRuntimeError("index out of range"), undefined) : powersOfTen[i]).exp >> 0) + 64 >> 0;
			if (exp < -60) {
				i = i + (1) >> 0;
			} else if (exp > -32) {
				i = i - (1) >> 0;
			} else {
				break Loop;
			}
		}
		f.Multiply($clone(((i < 0 || i >= powersOfTen.length) ? ($throwRuntimeError("index out of range"), undefined) : powersOfTen[i]), extFloat));
		_tmp = -((-348 + ($imul(i, 8)) >> 0));
		_tmp$1 = i;
		exp10 = _tmp;
		index = _tmp$1;
		return [exp10, index];
	};
	extFloat.prototype.frexp10 = function() { return this.$val.frexp10(); };
	frexp10Many = function(a, b, c) {
		var _tuple, a, b, c, exp10, i;
		exp10 = 0;
		_tuple = c.frexp10();
		exp10 = _tuple[0];
		i = _tuple[1];
		a.Multiply($clone(((i < 0 || i >= powersOfTen.length) ? ($throwRuntimeError("index out of range"), undefined) : powersOfTen[i]), extFloat));
		b.Multiply($clone(((i < 0 || i >= powersOfTen.length) ? ($throwRuntimeError("index out of range"), undefined) : powersOfTen[i]), extFloat));
		return exp10;
	};
	extFloat.ptr.prototype.FixedDecimal = function(d, n) {
		var $CE$B5, _q, _q$1, _tmp, _tmp$1, _tuple, buf, d, digit, exp10, f, fraction, i, i$1, i$2, integer, integerDigits, n, nd, needed, ok, pos, pow, pow10, rest, shift, v, v1, x, x$1, x$10, x$11, x$12, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		f = this;
		if ((x = f.mant, (x.$high === 0 && x.$low === 0))) {
			d.nd = 0;
			d.dp = 0;
			d.neg = f.neg;
			return true;
		}
		if (n === 0) {
			$panic(new $String("strconv: internal error: extFloat.FixedDecimal called with n == 0"));
		}
		f.Normalize();
		_tuple = f.frexp10();
		exp10 = _tuple[0];
		shift = ((-f.exp >>> 0));
		integer = (($shiftRightUint64(f.mant, shift).$low >>> 0));
		fraction = (x$1 = f.mant, x$2 = $shiftLeft64((new $Uint64(0, integer)), shift), new $Uint64(x$1.$high - x$2.$high, x$1.$low - x$2.$low));
		$CE$B5 = new $Uint64(0, 1);
		needed = n;
		integerDigits = 0;
		pow10 = new $Uint64(0, 1);
		_tmp = 0;
		_tmp$1 = new $Uint64(0, 1);
		i = _tmp;
		pow = _tmp$1;
		while (true) {
			if (!(i < 20)) { break; }
			if ((x$3 = (new $Uint64(0, integer)), (pow.$high > x$3.$high || (pow.$high === x$3.$high && pow.$low > x$3.$low)))) {
				integerDigits = i;
				break;
			}
			pow = $mul64(pow, (new $Uint64(0, 10)));
			i = i + (1) >> 0;
		}
		rest = integer;
		if (integerDigits > needed) {
			pow10 = (x$4 = integerDigits - needed >> 0, ((x$4 < 0 || x$4 >= uint64pow10.length) ? ($throwRuntimeError("index out of range"), undefined) : uint64pow10[x$4]));
			integer = (_q = integer / (((pow10.$low >>> 0))), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
			rest = rest - (($imul(integer, ((pow10.$low >>> 0))) >>> 0)) >>> 0;
		} else {
			rest = 0;
		}
		buf = arrayType$2.zero();
		pos = 32;
		v = integer;
		while (true) {
			if (!(v > 0)) { break; }
			v1 = (_q$1 = v / 10, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >>> 0 : $throwRuntimeError("integer divide by zero"));
			v = v - (($imul(10, v1) >>> 0)) >>> 0;
			pos = pos - (1) >> 0;
			((pos < 0 || pos >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[pos] = (((v + 48 >>> 0) << 24 >>> 24)));
			v = v1;
		}
		i$1 = pos;
		while (true) {
			if (!(i$1 < 32)) { break; }
			(x$5 = d.d, x$6 = i$1 - pos >> 0, ((x$6 < 0 || x$6 >= x$5.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$5.$array[x$5.$offset + x$6] = ((i$1 < 0 || i$1 >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[i$1])));
			i$1 = i$1 + (1) >> 0;
		}
		nd = 32 - pos >> 0;
		d.nd = nd;
		d.dp = integerDigits + exp10 >> 0;
		needed = needed - (nd) >> 0;
		if (needed > 0) {
			if (!((rest === 0)) || !((pow10.$high === 0 && pow10.$low === 1))) {
				$panic(new $String("strconv: internal error, rest != 0 but needed > 0"));
			}
			while (true) {
				if (!(needed > 0)) { break; }
				fraction = $mul64(fraction, (new $Uint64(0, 10)));
				$CE$B5 = $mul64($CE$B5, (new $Uint64(0, 10)));
				if ((x$7 = $mul64(new $Uint64(0, 2), $CE$B5), x$8 = $shiftLeft64(new $Uint64(0, 1), shift), (x$7.$high > x$8.$high || (x$7.$high === x$8.$high && x$7.$low > x$8.$low)))) {
					return false;
				}
				digit = $shiftRightUint64(fraction, shift);
				(x$9 = d.d, ((nd < 0 || nd >= x$9.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$9.$array[x$9.$offset + nd] = ((new $Uint64(digit.$high + 0, digit.$low + 48).$low << 24 >>> 24))));
				fraction = (x$10 = $shiftLeft64(digit, shift), new $Uint64(fraction.$high - x$10.$high, fraction.$low - x$10.$low));
				nd = nd + (1) >> 0;
				needed = needed - (1) >> 0;
			}
			d.nd = nd;
		}
		ok = adjustLastDigitFixed(d, (x$11 = $shiftLeft64((new $Uint64(0, rest)), shift), new $Uint64(x$11.$high | fraction.$high, (x$11.$low | fraction.$low) >>> 0)), pow10, shift, $CE$B5);
		if (!ok) {
			return false;
		}
		i$2 = d.nd - 1 >> 0;
		while (true) {
			if (!(i$2 >= 0)) { break; }
			if (!(((x$12 = d.d, ((i$2 < 0 || i$2 >= x$12.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$12.$array[x$12.$offset + i$2])) === 48))) {
				d.nd = i$2 + 1 >> 0;
				break;
			}
			i$2 = i$2 - (1) >> 0;
		}
		return true;
	};
	extFloat.prototype.FixedDecimal = function(d, n) { return this.$val.FixedDecimal(d, n); };
	adjustLastDigitFixed = function(d, num, den, shift, $CE$B5) {
		var $CE$B5, d, den, i, num, shift, x, x$1, x$10, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		if ((x = $shiftLeft64(den, shift), (num.$high > x.$high || (num.$high === x.$high && num.$low > x.$low)))) {
			$panic(new $String("strconv: num > den<<shift in adjustLastDigitFixed"));
		}
		if ((x$1 = $mul64(new $Uint64(0, 2), $CE$B5), x$2 = $shiftLeft64(den, shift), (x$1.$high > x$2.$high || (x$1.$high === x$2.$high && x$1.$low > x$2.$low)))) {
			$panic(new $String("strconv: \xCE\xB5 > (den<<shift)/2"));
		}
		if ((x$3 = $mul64(new $Uint64(0, 2), (new $Uint64(num.$high + $CE$B5.$high, num.$low + $CE$B5.$low))), x$4 = $shiftLeft64(den, shift), (x$3.$high < x$4.$high || (x$3.$high === x$4.$high && x$3.$low < x$4.$low)))) {
			return true;
		}
		if ((x$5 = $mul64(new $Uint64(0, 2), (new $Uint64(num.$high - $CE$B5.$high, num.$low - $CE$B5.$low))), x$6 = $shiftLeft64(den, shift), (x$5.$high > x$6.$high || (x$5.$high === x$6.$high && x$5.$low > x$6.$low)))) {
			i = d.nd - 1 >> 0;
			while (true) {
				if (!(i >= 0)) { break; }
				if ((x$7 = d.d, ((i < 0 || i >= x$7.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$7.$array[x$7.$offset + i])) === 57) {
					d.nd = d.nd - (1) >> 0;
				} else {
					break;
				}
				i = i - (1) >> 0;
			}
			if (i < 0) {
				(x$8 = d.d, (0 >= x$8.$length ? ($throwRuntimeError("index out of range"), undefined) : x$8.$array[x$8.$offset + 0] = 49));
				d.nd = 1;
				d.dp = d.dp + (1) >> 0;
			} else {
				(x$10 = d.d, ((i < 0 || i >= x$10.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$10.$array[x$10.$offset + i] = ((x$9 = d.d, ((i < 0 || i >= x$9.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$9.$array[x$9.$offset + i])) + (1) << 24 >>> 24)));
			}
			return true;
		}
		return false;
	};
	extFloat.ptr.prototype.ShortestDecimal = function(d, lower, upper) {
		var _q, _tmp, _tmp$1, _tmp$2, _tmp$3, allowance, buf, currentDiff, d, digit, digit$1, exp10, f, fraction, i, i$1, i$2, integer, integerDigits, lower, multiplier, n, nd, pow, pow$1, shift, targetDiff, upper, v, v1, x, x$1, x$10, x$11, x$12, x$13, x$14, x$15, x$16, x$17, x$18, x$19, x$2, x$20, x$21, x$22, x$23, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		f = this;
		if ((x = f.mant, (x.$high === 0 && x.$low === 0))) {
			d.nd = 0;
			d.dp = 0;
			d.neg = f.neg;
			return true;
		}
		if ((f.exp === 0) && $equal(lower, f, extFloat) && $equal(lower, upper, extFloat)) {
			buf = arrayType$1.zero();
			n = 23;
			v = f.mant;
			while (true) {
				if (!((v.$high > 0 || (v.$high === 0 && v.$low > 0)))) { break; }
				v1 = $div64(v, new $Uint64(0, 10), false);
				v = (x$1 = $mul64(new $Uint64(0, 10), v1), new $Uint64(v.$high - x$1.$high, v.$low - x$1.$low));
				((n < 0 || n >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[n] = ((new $Uint64(v.$high + 0, v.$low + 48).$low << 24 >>> 24)));
				n = n - (1) >> 0;
				v = v1;
			}
			nd = (24 - n >> 0) - 1 >> 0;
			i = 0;
			while (true) {
				if (!(i < nd)) { break; }
				(x$3 = d.d, ((i < 0 || i >= x$3.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$3.$array[x$3.$offset + i] = (x$2 = (n + 1 >> 0) + i >> 0, ((x$2 < 0 || x$2 >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[x$2]))));
				i = i + (1) >> 0;
			}
			_tmp = nd;
			_tmp$1 = nd;
			d.nd = _tmp;
			d.dp = _tmp$1;
			while (true) {
				if (!(d.nd > 0 && ((x$4 = d.d, x$5 = d.nd - 1 >> 0, ((x$5 < 0 || x$5 >= x$4.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$4.$array[x$4.$offset + x$5])) === 48))) { break; }
				d.nd = d.nd - (1) >> 0;
			}
			if (d.nd === 0) {
				d.dp = 0;
			}
			d.neg = f.neg;
			return true;
		}
		upper.Normalize();
		if (f.exp > upper.exp) {
			f.mant = $shiftLeft64(f.mant, ((((f.exp - upper.exp >> 0) >>> 0))));
			f.exp = upper.exp;
		}
		if (lower.exp > upper.exp) {
			lower.mant = $shiftLeft64(lower.mant, ((((lower.exp - upper.exp >> 0) >>> 0))));
			lower.exp = upper.exp;
		}
		exp10 = frexp10Many(lower, f, upper);
		upper.mant = (x$6 = upper.mant, x$7 = new $Uint64(0, 1), new $Uint64(x$6.$high + x$7.$high, x$6.$low + x$7.$low));
		lower.mant = (x$8 = lower.mant, x$9 = new $Uint64(0, 1), new $Uint64(x$8.$high - x$9.$high, x$8.$low - x$9.$low));
		shift = ((-upper.exp >>> 0));
		integer = (($shiftRightUint64(upper.mant, shift).$low >>> 0));
		fraction = (x$10 = upper.mant, x$11 = $shiftLeft64((new $Uint64(0, integer)), shift), new $Uint64(x$10.$high - x$11.$high, x$10.$low - x$11.$low));
		allowance = (x$12 = upper.mant, x$13 = lower.mant, new $Uint64(x$12.$high - x$13.$high, x$12.$low - x$13.$low));
		targetDiff = (x$14 = upper.mant, x$15 = f.mant, new $Uint64(x$14.$high - x$15.$high, x$14.$low - x$15.$low));
		integerDigits = 0;
		_tmp$2 = 0;
		_tmp$3 = new $Uint64(0, 1);
		i$1 = _tmp$2;
		pow = _tmp$3;
		while (true) {
			if (!(i$1 < 20)) { break; }
			if ((x$16 = (new $Uint64(0, integer)), (pow.$high > x$16.$high || (pow.$high === x$16.$high && pow.$low > x$16.$low)))) {
				integerDigits = i$1;
				break;
			}
			pow = $mul64(pow, (new $Uint64(0, 10)));
			i$1 = i$1 + (1) >> 0;
		}
		i$2 = 0;
		while (true) {
			if (!(i$2 < integerDigits)) { break; }
			pow$1 = (x$17 = (integerDigits - i$2 >> 0) - 1 >> 0, ((x$17 < 0 || x$17 >= uint64pow10.length) ? ($throwRuntimeError("index out of range"), undefined) : uint64pow10[x$17]));
			digit = (_q = integer / ((pow$1.$low >>> 0)), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
			(x$18 = d.d, ((i$2 < 0 || i$2 >= x$18.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$18.$array[x$18.$offset + i$2] = (((digit + 48 >>> 0) << 24 >>> 24))));
			integer = integer - (($imul(digit, ((pow$1.$low >>> 0))) >>> 0)) >>> 0;
			currentDiff = (x$19 = $shiftLeft64((new $Uint64(0, integer)), shift), new $Uint64(x$19.$high + fraction.$high, x$19.$low + fraction.$low));
			if ((currentDiff.$high < allowance.$high || (currentDiff.$high === allowance.$high && currentDiff.$low < allowance.$low))) {
				d.nd = i$2 + 1 >> 0;
				d.dp = integerDigits + exp10 >> 0;
				d.neg = f.neg;
				return adjustLastDigit(d, currentDiff, targetDiff, allowance, $shiftLeft64(pow$1, shift), new $Uint64(0, 2));
			}
			i$2 = i$2 + (1) >> 0;
		}
		d.nd = integerDigits;
		d.dp = d.nd + exp10 >> 0;
		d.neg = f.neg;
		digit$1 = 0;
		multiplier = new $Uint64(0, 1);
		while (true) {
			fraction = $mul64(fraction, (new $Uint64(0, 10)));
			multiplier = $mul64(multiplier, (new $Uint64(0, 10)));
			digit$1 = (($shiftRightUint64(fraction, shift).$low >> 0));
			(x$20 = d.d, x$21 = d.nd, ((x$21 < 0 || x$21 >= x$20.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$20.$array[x$20.$offset + x$21] = (((digit$1 + 48 >> 0) << 24 >>> 24))));
			d.nd = d.nd + (1) >> 0;
			fraction = (x$22 = $shiftLeft64((new $Uint64(0, digit$1)), shift), new $Uint64(fraction.$high - x$22.$high, fraction.$low - x$22.$low));
			if ((x$23 = $mul64(allowance, multiplier), (fraction.$high < x$23.$high || (fraction.$high === x$23.$high && fraction.$low < x$23.$low)))) {
				return adjustLastDigit(d, fraction, $mul64(targetDiff, multiplier), $mul64(allowance, multiplier), $shiftLeft64(new $Uint64(0, 1), shift), $mul64(multiplier, new $Uint64(0, 2)));
			}
		}
	};
	extFloat.prototype.ShortestDecimal = function(d, lower, upper) { return this.$val.ShortestDecimal(d, lower, upper); };
	adjustLastDigit = function(d, currentDiff, targetDiff, maxDiff, ulpDecimal, ulpBinary) {
		var _index, currentDiff, d, maxDiff, targetDiff, ulpBinary, ulpDecimal, x, x$1, x$10, x$11, x$12, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		if ((x = $mul64(new $Uint64(0, 2), ulpBinary), (ulpDecimal.$high < x.$high || (ulpDecimal.$high === x.$high && ulpDecimal.$low < x.$low)))) {
			return false;
		}
		while (true) {
			if (!((x$1 = (x$2 = (x$3 = $div64(ulpDecimal, new $Uint64(0, 2), false), new $Uint64(currentDiff.$high + x$3.$high, currentDiff.$low + x$3.$low)), new $Uint64(x$2.$high + ulpBinary.$high, x$2.$low + ulpBinary.$low)), (x$1.$high < targetDiff.$high || (x$1.$high === targetDiff.$high && x$1.$low < targetDiff.$low))))) { break; }
			_index = d.nd - 1 >> 0;
			(x$5 = d.d, ((_index < 0 || _index >= x$5.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$5.$array[x$5.$offset + _index] = ((x$4 = d.d, ((_index < 0 || _index >= x$4.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$4.$array[x$4.$offset + _index])) - (1) << 24 >>> 24)));
			currentDiff = (x$6 = ulpDecimal, new $Uint64(currentDiff.$high + x$6.$high, currentDiff.$low + x$6.$low));
		}
		if ((x$7 = new $Uint64(currentDiff.$high + ulpDecimal.$high, currentDiff.$low + ulpDecimal.$low), x$8 = (x$9 = (x$10 = $div64(ulpDecimal, new $Uint64(0, 2), false), new $Uint64(targetDiff.$high + x$10.$high, targetDiff.$low + x$10.$low)), new $Uint64(x$9.$high + ulpBinary.$high, x$9.$low + ulpBinary.$low)), (x$7.$high < x$8.$high || (x$7.$high === x$8.$high && x$7.$low <= x$8.$low)))) {
			return false;
		}
		if ((currentDiff.$high < ulpBinary.$high || (currentDiff.$high === ulpBinary.$high && currentDiff.$low < ulpBinary.$low)) || (x$11 = new $Uint64(maxDiff.$high - ulpBinary.$high, maxDiff.$low - ulpBinary.$low), (currentDiff.$high > x$11.$high || (currentDiff.$high === x$11.$high && currentDiff.$low > x$11.$low)))) {
			return false;
		}
		if ((d.nd === 1) && ((x$12 = d.d, (0 >= x$12.$length ? ($throwRuntimeError("index out of range"), undefined) : x$12.$array[x$12.$offset + 0])) === 48)) {
			d.nd = 0;
			d.dp = 0;
		}
		return true;
	};
	FormatFloat = function(f, fmt, prec, bitSize) {
		var bitSize, f, fmt, prec;
		return ($bytesToString(genericFtoa($makeSlice(sliceType$6, 0, max(prec + 4 >> 0, 24)), f, fmt, prec, bitSize)));
	};
	$pkg.FormatFloat = FormatFloat;
	genericFtoa = function(dst, val, fmt, prec, bitSize) {
		var _1, _2, _3, _4, _tuple, bitSize, bits$1, buf, buf$1, digits, digs, dst, exp, f, f$1, flt, fmt, lower, mant, neg, ok, prec, s, shortest, upper, val, x, x$1, x$2, x$3, y, y$1;
		bits$1 = new $Uint64(0, 0);
		flt = ptrType$1.nil;
		_1 = bitSize;
		if (_1 === (32)) {
			bits$1 = (new $Uint64(0, math.Float32bits(($fround(val)))));
			flt = float32info;
		} else if (_1 === (64)) {
			bits$1 = math.Float64bits(val);
			flt = float64info;
		} else {
			$panic(new $String("strconv: illegal AppendFloat/FormatFloat bitSize"));
		}
		neg = !((x = $shiftRightUint64(bits$1, ((flt.expbits + flt.mantbits >>> 0))), (x.$high === 0 && x.$low === 0)));
		exp = (($shiftRightUint64(bits$1, flt.mantbits).$low >> 0)) & ((((y = flt.expbits, y < 32 ? (1 << y) : 0) >> 0) - 1 >> 0));
		mant = (x$1 = (x$2 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), new $Uint64(x$2.$high - 0, x$2.$low - 1)), new $Uint64(bits$1.$high & x$1.$high, (bits$1.$low & x$1.$low) >>> 0));
		_2 = exp;
		if (_2 === ((((y$1 = flt.expbits, y$1 < 32 ? (1 << y$1) : 0) >> 0) - 1 >> 0))) {
			s = "";
			if (!((mant.$high === 0 && mant.$low === 0))) {
				s = "NaN";
			} else if (neg) {
				s = "-Inf";
			} else {
				s = "+Inf";
			}
			return $appendSlice(dst, s);
		} else if (_2 === (0)) {
			exp = exp + (1) >> 0;
		} else {
			mant = (x$3 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), new $Uint64(mant.$high | x$3.$high, (mant.$low | x$3.$low) >>> 0));
		}
		exp = exp + (flt.bias) >> 0;
		if (fmt === 98) {
			return fmtB(dst, neg, mant, exp, flt);
		}
		if (!optimize) {
			return bigFtoa(dst, prec, fmt, neg, mant, exp, flt);
		}
		digs = new decimalSlice.ptr(sliceType$6.nil, 0, 0, false);
		ok = false;
		shortest = prec < 0;
		if (shortest) {
			f = new extFloat.ptr(new $Uint64(0, 0), 0, false);
			_tuple = f.AssignComputeBounds(mant, exp, neg, flt);
			lower = $clone(_tuple[0], extFloat);
			upper = $clone(_tuple[1], extFloat);
			buf = arrayType$2.zero();
			digs.d = new sliceType$6(buf);
			ok = f.ShortestDecimal(digs, lower, upper);
			if (!ok) {
				return bigFtoa(dst, prec, fmt, neg, mant, exp, flt);
			}
			_3 = fmt;
			if ((_3 === (101)) || (_3 === (69))) {
				prec = max(digs.nd - 1 >> 0, 0);
			} else if (_3 === (102)) {
				prec = max(digs.nd - digs.dp >> 0, 0);
			} else if ((_3 === (103)) || (_3 === (71))) {
				prec = digs.nd;
			}
		} else if (!((fmt === 102))) {
			digits = prec;
			_4 = fmt;
			if ((_4 === (101)) || (_4 === (69))) {
				digits = digits + (1) >> 0;
			} else if ((_4 === (103)) || (_4 === (71))) {
				if (prec === 0) {
					prec = 1;
				}
				digits = prec;
			}
			if (digits <= 15) {
				buf$1 = arrayType$1.zero();
				digs.d = new sliceType$6(buf$1);
				f$1 = new extFloat.ptr(mant, exp - ((flt.mantbits >> 0)) >> 0, neg);
				ok = f$1.FixedDecimal(digs, digits);
			}
		}
		if (!ok) {
			return bigFtoa(dst, prec, fmt, neg, mant, exp, flt);
		}
		return formatDigits(dst, shortest, neg, $clone(digs, decimalSlice), prec, fmt);
	};
	bigFtoa = function(dst, prec, fmt, neg, mant, exp, flt) {
		var _1, _2, d, digs, dst, exp, flt, fmt, mant, neg, prec, shortest;
		d = new decimal.ptr(arrayType.zero(), 0, 0, false, false);
		d.Assign(mant);
		d.Shift(exp - ((flt.mantbits >> 0)) >> 0);
		digs = new decimalSlice.ptr(sliceType$6.nil, 0, 0, false);
		shortest = prec < 0;
		if (shortest) {
			roundShortest(d, mant, exp, flt);
			decimalSlice.copy(digs, new decimalSlice.ptr(new sliceType$6(d.d), d.nd, d.dp, false));
			_1 = fmt;
			if ((_1 === (101)) || (_1 === (69))) {
				prec = digs.nd - 1 >> 0;
			} else if (_1 === (102)) {
				prec = max(digs.nd - digs.dp >> 0, 0);
			} else if ((_1 === (103)) || (_1 === (71))) {
				prec = digs.nd;
			}
		} else {
			_2 = fmt;
			if ((_2 === (101)) || (_2 === (69))) {
				d.Round(prec + 1 >> 0);
			} else if (_2 === (102)) {
				d.Round(d.dp + prec >> 0);
			} else if ((_2 === (103)) || (_2 === (71))) {
				if (prec === 0) {
					prec = 1;
				}
				d.Round(prec);
			}
			decimalSlice.copy(digs, new decimalSlice.ptr(new sliceType$6(d.d), d.nd, d.dp, false));
		}
		return formatDigits(dst, shortest, neg, $clone(digs, decimalSlice), prec, fmt);
	};
	formatDigits = function(dst, shortest, neg, digs, prec, fmt) {
		var _1, digs, dst, eprec, exp, fmt, neg, prec, shortest;
		_1 = fmt;
		if ((_1 === (101)) || (_1 === (69))) {
			return fmtE(dst, neg, $clone(digs, decimalSlice), prec, fmt);
		} else if (_1 === (102)) {
			return fmtF(dst, neg, $clone(digs, decimalSlice), prec);
		} else if ((_1 === (103)) || (_1 === (71))) {
			eprec = prec;
			if (eprec > digs.nd && digs.nd >= digs.dp) {
				eprec = digs.nd;
			}
			if (shortest) {
				eprec = 6;
			}
			exp = digs.dp - 1 >> 0;
			if (exp < -4 || exp >= eprec) {
				if (prec > digs.nd) {
					prec = digs.nd;
				}
				return fmtE(dst, neg, $clone(digs, decimalSlice), prec - 1 >> 0, (fmt + 101 << 24 >>> 24) - 103 << 24 >>> 24);
			}
			if (prec > digs.dp) {
				prec = digs.nd;
			}
			return fmtF(dst, neg, $clone(digs, decimalSlice), max(prec - digs.dp >> 0, 0));
		}
		return $append(dst, 37, fmt);
	};
	roundShortest = function(d, mant, exp, flt) {
		var d, exp, explo, flt, i, inclusive, l, lower, m, mant, mantlo, minexp, okdown, okup, u, upper, x, x$1, x$2, x$3, x$4, x$5, x$6, x$7;
		if ((mant.$high === 0 && mant.$low === 0)) {
			d.nd = 0;
			return;
		}
		minexp = flt.bias + 1 >> 0;
		if (exp > minexp && ($imul(332, ((d.dp - d.nd >> 0)))) >= ($imul(100, ((exp - ((flt.mantbits >> 0)) >> 0))))) {
			return;
		}
		upper = new decimal.ptr(arrayType.zero(), 0, 0, false, false);
		upper.Assign((x = $mul64(mant, new $Uint64(0, 2)), new $Uint64(x.$high + 0, x.$low + 1)));
		upper.Shift((exp - ((flt.mantbits >> 0)) >> 0) - 1 >> 0);
		mantlo = new $Uint64(0, 0);
		explo = 0;
		if ((x$1 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), (mant.$high > x$1.$high || (mant.$high === x$1.$high && mant.$low > x$1.$low))) || (exp === minexp)) {
			mantlo = new $Uint64(mant.$high - 0, mant.$low - 1);
			explo = exp;
		} else {
			mantlo = (x$2 = $mul64(mant, new $Uint64(0, 2)), new $Uint64(x$2.$high - 0, x$2.$low - 1));
			explo = exp - 1 >> 0;
		}
		lower = new decimal.ptr(arrayType.zero(), 0, 0, false, false);
		lower.Assign((x$3 = $mul64(mantlo, new $Uint64(0, 2)), new $Uint64(x$3.$high + 0, x$3.$low + 1)));
		lower.Shift((explo - ((flt.mantbits >> 0)) >> 0) - 1 >> 0);
		inclusive = (x$4 = $div64(mant, new $Uint64(0, 2), true), (x$4.$high === 0 && x$4.$low === 0));
		i = 0;
		while (true) {
			if (!(i < d.nd)) { break; }
			l = 48;
			if (i < lower.nd) {
				l = (x$5 = lower.d, ((i < 0 || i >= x$5.length) ? ($throwRuntimeError("index out of range"), undefined) : x$5[i]));
			}
			m = (x$6 = d.d, ((i < 0 || i >= x$6.length) ? ($throwRuntimeError("index out of range"), undefined) : x$6[i]));
			u = 48;
			if (i < upper.nd) {
				u = (x$7 = upper.d, ((i < 0 || i >= x$7.length) ? ($throwRuntimeError("index out of range"), undefined) : x$7[i]));
			}
			okdown = !((l === m)) || inclusive && ((i + 1 >> 0) === lower.nd);
			okup = !((m === u)) && (inclusive || (m + 1 << 24 >>> 24) < u || (i + 1 >> 0) < upper.nd);
			if (okdown && okup) {
				d.Round(i + 1 >> 0);
				return;
			} else if (okdown) {
				d.RoundDown(i + 1 >> 0);
				return;
			} else if (okup) {
				d.RoundUp(i + 1 >> 0);
				return;
			}
			i = i + (1) >> 0;
		}
	};
	fmtE = function(dst, neg, d, prec, fmt) {
		var _q, _q$1, _q$2, _r, _r$1, _r$2, ch, d, dst, exp, fmt, i, m, neg, prec, x;
		if (neg) {
			dst = $append(dst, 45);
		}
		ch = 48;
		if (!((d.nd === 0))) {
			ch = (x = d.d, (0 >= x.$length ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + 0]));
		}
		dst = $append(dst, ch);
		if (prec > 0) {
			dst = $append(dst, 46);
			i = 1;
			m = min(d.nd, prec + 1 >> 0);
			if (i < m) {
				dst = $appendSlice(dst, $subslice(d.d, i, m));
				i = m;
			}
			while (true) {
				if (!(i <= prec)) { break; }
				dst = $append(dst, 48);
				i = i + (1) >> 0;
			}
		}
		dst = $append(dst, fmt);
		exp = d.dp - 1 >> 0;
		if (d.nd === 0) {
			exp = 0;
		}
		if (exp < 0) {
			ch = 45;
			exp = -exp;
		} else {
			ch = 43;
		}
		dst = $append(dst, ch);
		if (exp < 10) {
			dst = $append(dst, 48, ((exp << 24 >>> 24)) + 48 << 24 >>> 24);
		} else if (exp < 100) {
			dst = $append(dst, (((_q = exp / 10, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) + 48 << 24 >>> 24, (((_r = exp % 10, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) + 48 << 24 >>> 24);
		} else {
			dst = $append(dst, (((_q$1 = exp / 100, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) + 48 << 24 >>> 24, (_r$1 = (((_q$2 = exp / 10, (_q$2 === _q$2 && _q$2 !== 1/0 && _q$2 !== -1/0) ? _q$2 >> 0 : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) % 10, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) + 48 << 24 >>> 24, (((_r$2 = exp % 10, _r$2 === _r$2 ? _r$2 : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) + 48 << 24 >>> 24);
		}
		return dst;
	};
	fmtF = function(dst, neg, d, prec) {
		var ch, d, dst, i, j, m, neg, prec, x;
		if (neg) {
			dst = $append(dst, 45);
		}
		if (d.dp > 0) {
			m = min(d.nd, d.dp);
			dst = $appendSlice(dst, $subslice(d.d, 0, m));
			while (true) {
				if (!(m < d.dp)) { break; }
				dst = $append(dst, 48);
				m = m + (1) >> 0;
			}
		} else {
			dst = $append(dst, 48);
		}
		if (prec > 0) {
			dst = $append(dst, 46);
			i = 0;
			while (true) {
				if (!(i < prec)) { break; }
				ch = 48;
				j = d.dp + i >> 0;
				if (0 <= j && j < d.nd) {
					ch = (x = d.d, ((j < 0 || j >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + j]));
				}
				dst = $append(dst, ch);
				i = i + (1) >> 0;
			}
		}
		return dst;
	};
	fmtB = function(dst, neg, mant, exp, flt) {
		var _tuple, _tuple$1, dst, exp, flt, mant, neg;
		if (neg) {
			dst = $append(dst, 45);
		}
		_tuple = formatBits(dst, mant, 10, false, true);
		dst = _tuple[0];
		dst = $append(dst, 112);
		exp = exp - (((flt.mantbits >> 0))) >> 0;
		if (exp >= 0) {
			dst = $append(dst, 43);
		}
		_tuple$1 = formatBits(dst, (new $Uint64(0, exp)), 10, exp < 0, true);
		dst = _tuple$1[0];
		return dst;
	};
	min = function(a, b) {
		var a, b;
		if (a < b) {
			return a;
		}
		return b;
	};
	max = function(a, b) {
		var a, b;
		if (a > b) {
			return a;
		}
		return b;
	};
	formatBits = function(dst, u, base, neg, append_) {
		var _q, _q$1, _r, _r$1, a, append_, b, b$1, base, d, dst, i, is, is$1, is$2, j, m, neg, q, q$1, s, shift, u, us, us$1, x, x$1, x$2, x$3, x$4, x$5;
		d = sliceType$6.nil;
		s = "";
		if (base < 2 || base > 36) {
			$panic(new $String("strconv: illegal AppendInt/FormatInt base"));
		}
		a = arrayType$3.zero();
		i = 65;
		if (neg) {
			u = new $Uint64(-u.$high, -u.$low);
		}
		if (base === 10) {
			if (true) {
				while (true) {
					if (!((u.$high > 0 || (u.$high === 0 && u.$low >= 1000000000)))) { break; }
					q = $div64(u, new $Uint64(0, 1000000000), false);
					us = (((x = $mul64(q, new $Uint64(0, 1000000000)), new $Uint64(u.$high - x.$high, u.$low - x.$low)).$low >>> 0));
					j = 4;
					while (true) {
						if (!(j > 0)) { break; }
						is = (_r = us % 100, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) * 2 >>> 0;
						us = (_q = us / (100), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
						i = i - (2) >> 0;
						(x$1 = i + 1 >> 0, ((x$1 < 0 || x$1 >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[x$1] = "00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899".charCodeAt((is + 1 >>> 0))));
						(x$2 = i + 0 >> 0, ((x$2 < 0 || x$2 >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[x$2] = "00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899".charCodeAt((is + 0 >>> 0))));
						j = j - (1) >> 0;
					}
					i = i - (1) >> 0;
					((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899".charCodeAt(((us * 2 >>> 0) + 1 >>> 0)));
					u = q;
				}
			}
			us$1 = ((u.$low >>> 0));
			while (true) {
				if (!(us$1 >= 100)) { break; }
				is$1 = (_r$1 = us$1 % 100, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) * 2 >>> 0;
				us$1 = (_q$1 = us$1 / (100), (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >>> 0 : $throwRuntimeError("integer divide by zero"));
				i = i - (2) >> 0;
				(x$3 = i + 1 >> 0, ((x$3 < 0 || x$3 >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[x$3] = "00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899".charCodeAt((is$1 + 1 >>> 0))));
				(x$4 = i + 0 >> 0, ((x$4 < 0 || x$4 >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[x$4] = "00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899".charCodeAt((is$1 + 0 >>> 0))));
			}
			is$2 = us$1 * 2 >>> 0;
			i = i - (1) >> 0;
			((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899".charCodeAt((is$2 + 1 >>> 0)));
			if (us$1 >= 10) {
				i = i - (1) >> 0;
				((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899".charCodeAt(is$2));
			}
		} else if (isPowerOfTwo(base)) {
			shift = (((bits.TrailingZeros(((base >>> 0))) >>> 0)) & 7) >>> 0;
			b = (new $Uint64(0, base));
			m = ((base >>> 0)) - 1 >>> 0;
			while (true) {
				if (!((u.$high > b.$high || (u.$high === b.$high && u.$low >= b.$low)))) { break; }
				i = i - (1) >> 0;
				((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt(((((u.$low >>> 0)) & m) >>> 0)));
				u = $shiftRightUint64(u, (shift));
			}
			i = i - (1) >> 0;
			((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt(((u.$low >>> 0))));
		} else {
			b$1 = (new $Uint64(0, base));
			while (true) {
				if (!((u.$high > b$1.$high || (u.$high === b$1.$high && u.$low >= b$1.$low)))) { break; }
				i = i - (1) >> 0;
				q$1 = $div64(u, b$1, false);
				((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt((((x$5 = $mul64(q$1, b$1), new $Uint64(u.$high - x$5.$high, u.$low - x$5.$low)).$low >>> 0))));
				u = q$1;
			}
			i = i - (1) >> 0;
			((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt(((u.$low >>> 0))));
		}
		if (neg) {
			i = i - (1) >> 0;
			((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = 45);
		}
		if (append_) {
			d = $appendSlice(dst, $subslice(new sliceType$6(a), i));
			return [d, s];
		}
		s = ($bytesToString($subslice(new sliceType$6(a), i)));
		return [d, s];
	};
	isPowerOfTwo = function(x) {
		var x;
		return (x & ((x - 1 >> 0))) === 0;
	};
	ptrType$2.methods = [{prop: "set", name: "set", pkg: "strconv", typ: $funcType([$String], [$Bool], false)}, {prop: "floatBits", name: "floatBits", pkg: "strconv", typ: $funcType([ptrType$1], [$Uint64, $Bool], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Assign", name: "Assign", pkg: "", typ: $funcType([$Uint64], [], false)}, {prop: "Shift", name: "Shift", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "Round", name: "Round", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "RoundDown", name: "RoundDown", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "RoundUp", name: "RoundUp", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "RoundedInteger", name: "RoundedInteger", pkg: "", typ: $funcType([], [$Uint64], false)}];
	ptrType$4.methods = [{prop: "floatBits", name: "floatBits", pkg: "strconv", typ: $funcType([ptrType$1], [$Uint64, $Bool], false)}, {prop: "AssignComputeBounds", name: "AssignComputeBounds", pkg: "", typ: $funcType([$Uint64, $Int, $Bool, ptrType$1], [extFloat, extFloat], false)}, {prop: "Normalize", name: "Normalize", pkg: "", typ: $funcType([], [$Uint], false)}, {prop: "Multiply", name: "Multiply", pkg: "", typ: $funcType([extFloat], [], false)}, {prop: "AssignDecimal", name: "AssignDecimal", pkg: "", typ: $funcType([$Uint64, $Int, $Bool, $Bool, ptrType$1], [$Bool], false)}, {prop: "frexp10", name: "frexp10", pkg: "strconv", typ: $funcType([], [$Int, $Int], false)}, {prop: "FixedDecimal", name: "FixedDecimal", pkg: "", typ: $funcType([ptrType$3, $Int], [$Bool], false)}, {prop: "ShortestDecimal", name: "ShortestDecimal", pkg: "", typ: $funcType([ptrType$3, ptrType$4, ptrType$4], [$Bool], false)}];
	decimal.init("strconv", [{prop: "d", name: "d", embedded: false, exported: false, typ: arrayType, tag: ""}, {prop: "nd", name: "nd", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "dp", name: "dp", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "neg", name: "neg", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "trunc", name: "trunc", embedded: false, exported: false, typ: $Bool, tag: ""}]);
	leftCheat.init("strconv", [{prop: "delta", name: "delta", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "cutoff", name: "cutoff", embedded: false, exported: false, typ: $String, tag: ""}]);
	extFloat.init("strconv", [{prop: "mant", name: "mant", embedded: false, exported: false, typ: $Uint64, tag: ""}, {prop: "exp", name: "exp", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "neg", name: "neg", embedded: false, exported: false, typ: $Bool, tag: ""}]);
	floatInfo.init("strconv", [{prop: "mantbits", name: "mantbits", embedded: false, exported: false, typ: $Uint, tag: ""}, {prop: "expbits", name: "expbits", embedded: false, exported: false, typ: $Uint, tag: ""}, {prop: "bias", name: "bias", embedded: false, exported: false, typ: $Int, tag: ""}]);
	decimalSlice.init("strconv", [{prop: "d", name: "d", embedded: false, exported: false, typ: sliceType$6, tag: ""}, {prop: "nd", name: "nd", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "dp", name: "dp", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "neg", name: "neg", embedded: false, exported: false, typ: $Bool, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = errors.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = bytealg.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = math.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = bits.$init(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = utf8.$init(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		optimize = true;
		$pkg.ErrRange = errors.New("value out of range");
		$pkg.ErrSyntax = errors.New("invalid syntax");
		leftcheats = new sliceType$3([new leftCheat.ptr(0, ""), new leftCheat.ptr(1, "5"), new leftCheat.ptr(1, "25"), new leftCheat.ptr(1, "125"), new leftCheat.ptr(2, "625"), new leftCheat.ptr(2, "3125"), new leftCheat.ptr(2, "15625"), new leftCheat.ptr(3, "78125"), new leftCheat.ptr(3, "390625"), new leftCheat.ptr(3, "1953125"), new leftCheat.ptr(4, "9765625"), new leftCheat.ptr(4, "48828125"), new leftCheat.ptr(4, "244140625"), new leftCheat.ptr(4, "1220703125"), new leftCheat.ptr(5, "6103515625"), new leftCheat.ptr(5, "30517578125"), new leftCheat.ptr(5, "152587890625"), new leftCheat.ptr(6, "762939453125"), new leftCheat.ptr(6, "3814697265625"), new leftCheat.ptr(6, "19073486328125"), new leftCheat.ptr(7, "95367431640625"), new leftCheat.ptr(7, "476837158203125"), new leftCheat.ptr(7, "2384185791015625"), new leftCheat.ptr(7, "11920928955078125"), new leftCheat.ptr(8, "59604644775390625"), new leftCheat.ptr(8, "298023223876953125"), new leftCheat.ptr(8, "1490116119384765625"), new leftCheat.ptr(9, "7450580596923828125"), new leftCheat.ptr(9, "37252902984619140625"), new leftCheat.ptr(9, "186264514923095703125"), new leftCheat.ptr(10, "931322574615478515625"), new leftCheat.ptr(10, "4656612873077392578125"), new leftCheat.ptr(10, "23283064365386962890625"), new leftCheat.ptr(10, "116415321826934814453125"), new leftCheat.ptr(11, "582076609134674072265625"), new leftCheat.ptr(11, "2910383045673370361328125"), new leftCheat.ptr(11, "14551915228366851806640625"), new leftCheat.ptr(12, "72759576141834259033203125"), new leftCheat.ptr(12, "363797880709171295166015625"), new leftCheat.ptr(12, "1818989403545856475830078125"), new leftCheat.ptr(13, "9094947017729282379150390625"), new leftCheat.ptr(13, "45474735088646411895751953125"), new leftCheat.ptr(13, "227373675443232059478759765625"), new leftCheat.ptr(13, "1136868377216160297393798828125"), new leftCheat.ptr(14, "5684341886080801486968994140625"), new leftCheat.ptr(14, "28421709430404007434844970703125"), new leftCheat.ptr(14, "142108547152020037174224853515625"), new leftCheat.ptr(15, "710542735760100185871124267578125"), new leftCheat.ptr(15, "3552713678800500929355621337890625"), new leftCheat.ptr(15, "17763568394002504646778106689453125"), new leftCheat.ptr(16, "88817841970012523233890533447265625"), new leftCheat.ptr(16, "444089209850062616169452667236328125"), new leftCheat.ptr(16, "2220446049250313080847263336181640625"), new leftCheat.ptr(16, "11102230246251565404236316680908203125"), new leftCheat.ptr(17, "55511151231257827021181583404541015625"), new leftCheat.ptr(17, "277555756156289135105907917022705078125"), new leftCheat.ptr(17, "1387778780781445675529539585113525390625"), new leftCheat.ptr(18, "6938893903907228377647697925567626953125"), new leftCheat.ptr(18, "34694469519536141888238489627838134765625"), new leftCheat.ptr(18, "173472347597680709441192448139190673828125"), new leftCheat.ptr(19, "867361737988403547205962240695953369140625")]);
		smallPowersOfTen = $toNativeArray($kindStruct, [new extFloat.ptr(new $Uint64(2147483648, 0), -63, false), new extFloat.ptr(new $Uint64(2684354560, 0), -60, false), new extFloat.ptr(new $Uint64(3355443200, 0), -57, false), new extFloat.ptr(new $Uint64(4194304000, 0), -54, false), new extFloat.ptr(new $Uint64(2621440000, 0), -50, false), new extFloat.ptr(new $Uint64(3276800000, 0), -47, false), new extFloat.ptr(new $Uint64(4096000000, 0), -44, false), new extFloat.ptr(new $Uint64(2560000000, 0), -40, false)]);
		powersOfTen = $toNativeArray($kindStruct, [new extFloat.ptr(new $Uint64(4203730336, 136053384), -1220, false), new extFloat.ptr(new $Uint64(3132023167, 2722021238), -1193, false), new extFloat.ptr(new $Uint64(2333539104, 810921078), -1166, false), new extFloat.ptr(new $Uint64(3477244234, 1573795306), -1140, false), new extFloat.ptr(new $Uint64(2590748842, 1432697645), -1113, false), new extFloat.ptr(new $Uint64(3860516611, 1025131999), -1087, false), new extFloat.ptr(new $Uint64(2876309015, 3348809418), -1060, false), new extFloat.ptr(new $Uint64(4286034428, 3200048207), -1034, false), new extFloat.ptr(new $Uint64(3193344495, 1097586188), -1007, false), new extFloat.ptr(new $Uint64(2379227053, 2424306748), -980, false), new extFloat.ptr(new $Uint64(3545324584, 827693699), -954, false), new extFloat.ptr(new $Uint64(2641472655, 2913388981), -927, false), new extFloat.ptr(new $Uint64(3936100983, 602835915), -901, false), new extFloat.ptr(new $Uint64(2932623761, 1081627501), -874, false), new extFloat.ptr(new $Uint64(2184974969, 1572261463), -847, false), new extFloat.ptr(new $Uint64(3255866422, 1308317239), -821, false), new extFloat.ptr(new $Uint64(2425809519, 944281679), -794, false), new extFloat.ptr(new $Uint64(3614737867, 629291719), -768, false), new extFloat.ptr(new $Uint64(2693189581, 2545915892), -741, false), new extFloat.ptr(new $Uint64(4013165208, 388672741), -715, false), new extFloat.ptr(new $Uint64(2990041083, 708162190), -688, false), new extFloat.ptr(new $Uint64(2227754207, 3536207675), -661, false), new extFloat.ptr(new $Uint64(3319612455, 450088378), -635, false), new extFloat.ptr(new $Uint64(2473304014, 3139815830), -608, false), new extFloat.ptr(new $Uint64(3685510180, 2103616900), -582, false), new extFloat.ptr(new $Uint64(2745919064, 224385782), -555, false), new extFloat.ptr(new $Uint64(4091738259, 3737383206), -529, false), new extFloat.ptr(new $Uint64(3048582568, 2868871352), -502, false), new extFloat.ptr(new $Uint64(2271371013, 1820084875), -475, false), new extFloat.ptr(new $Uint64(3384606560, 885076051), -449, false), new extFloat.ptr(new $Uint64(2521728396, 2444895829), -422, false), new extFloat.ptr(new $Uint64(3757668132, 1881767613), -396, false), new extFloat.ptr(new $Uint64(2799680927, 3102062735), -369, false), new extFloat.ptr(new $Uint64(4171849679, 2289335700), -343, false), new extFloat.ptr(new $Uint64(3108270227, 2410191823), -316, false), new extFloat.ptr(new $Uint64(2315841784, 3205436779), -289, false), new extFloat.ptr(new $Uint64(3450873173, 1697722806), -263, false), new extFloat.ptr(new $Uint64(2571100870, 3497754540), -236, false), new extFloat.ptr(new $Uint64(3831238852, 707476230), -210, false), new extFloat.ptr(new $Uint64(2854495385, 1769181907), -183, false), new extFloat.ptr(new $Uint64(4253529586, 2197867022), -157, false), new extFloat.ptr(new $Uint64(3169126500, 2450594539), -130, false), new extFloat.ptr(new $Uint64(2361183241, 1867548876), -103, false), new extFloat.ptr(new $Uint64(3518437208, 3793315116), -77, false), new extFloat.ptr(new $Uint64(2621440000, 0), -50, false), new extFloat.ptr(new $Uint64(3906250000, 0), -24, false), new extFloat.ptr(new $Uint64(2910383045, 2892103680), 3, false), new extFloat.ptr(new $Uint64(2168404344, 4170451332), 30, false), new extFloat.ptr(new $Uint64(3231174267, 3372684723), 56, false), new extFloat.ptr(new $Uint64(2407412430, 2078956656), 83, false), new extFloat.ptr(new $Uint64(3587324068, 2884206696), 109, false), new extFloat.ptr(new $Uint64(2672764710, 395977285), 136, false), new extFloat.ptr(new $Uint64(3982729777, 3569679143), 162, false), new extFloat.ptr(new $Uint64(2967364920, 2361961896), 189, false), new extFloat.ptr(new $Uint64(2210859150, 447440347), 216, false), new extFloat.ptr(new $Uint64(3294436857, 1114709402), 242, false), new extFloat.ptr(new $Uint64(2454546732, 2786846552), 269, false), new extFloat.ptr(new $Uint64(3657559652, 443583978), 295, false), new extFloat.ptr(new $Uint64(2725094297, 2599384906), 322, false), new extFloat.ptr(new $Uint64(4060706939, 3028118405), 348, false), new extFloat.ptr(new $Uint64(3025462433, 2044532855), 375, false), new extFloat.ptr(new $Uint64(2254145170, 1536935362), 402, false), new extFloat.ptr(new $Uint64(3358938053, 3365297469), 428, false), new extFloat.ptr(new $Uint64(2502603868, 4204241075), 455, false), new extFloat.ptr(new $Uint64(3729170365, 2577424355), 481, false), new extFloat.ptr(new $Uint64(2778448436, 3677981733), 508, false), new extFloat.ptr(new $Uint64(4140210802, 2744688476), 534, false), new extFloat.ptr(new $Uint64(3084697427, 1424604878), 561, false), new extFloat.ptr(new $Uint64(2298278679, 4062331362), 588, false), new extFloat.ptr(new $Uint64(3424702107, 3546052773), 614, false), new extFloat.ptr(new $Uint64(2551601907, 2065781727), 641, false), new extFloat.ptr(new $Uint64(3802183132, 2535403578), 667, false), new extFloat.ptr(new $Uint64(2832847187, 1558426518), 694, false), new extFloat.ptr(new $Uint64(4221271257, 2762425404), 720, false), new extFloat.ptr(new $Uint64(3145092172, 2812560400), 747, false), new extFloat.ptr(new $Uint64(2343276271, 3057687578), 774, false), new extFloat.ptr(new $Uint64(3491753744, 2790753324), 800, false), new extFloat.ptr(new $Uint64(2601559269, 3918606633), 827, false), new extFloat.ptr(new $Uint64(3876625403, 2711358621), 853, false), new extFloat.ptr(new $Uint64(2888311001, 1648096297), 880, false), new extFloat.ptr(new $Uint64(2151959390, 2057817989), 907, false), new extFloat.ptr(new $Uint64(3206669376, 61660461), 933, false), new extFloat.ptr(new $Uint64(2389154863, 1581580175), 960, false), new extFloat.ptr(new $Uint64(3560118173, 2626467905), 986, false), new extFloat.ptr(new $Uint64(2652494738, 3034782633), 1013, false), new extFloat.ptr(new $Uint64(3952525166, 3135207385), 1039, false), new extFloat.ptr(new $Uint64(2944860731, 2616258155), 1066, false)]);
		uint64pow10 = $toNativeArray($kindUint64, [new $Uint64(0, 1), new $Uint64(0, 10), new $Uint64(0, 100), new $Uint64(0, 1000), new $Uint64(0, 10000), new $Uint64(0, 100000), new $Uint64(0, 1000000), new $Uint64(0, 10000000), new $Uint64(0, 100000000), new $Uint64(0, 1000000000), new $Uint64(2, 1410065408), new $Uint64(23, 1215752192), new $Uint64(232, 3567587328), new $Uint64(2328, 1316134912), new $Uint64(23283, 276447232), new $Uint64(232830, 2764472320), new $Uint64(2328306, 1874919424), new $Uint64(23283064, 1569325056), new $Uint64(232830643, 2808348672), new $Uint64(2328306436, 2313682944)]);
		float32info = new floatInfo.ptr(23, 8, -127);
		float64info = new floatInfo.ptr(52, 11, -1023);
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["internal/race"] = (function() {
	var $pkg = {}, $init, Acquire, Release;
	Acquire = function(addr) {
		var addr;
	};
	$pkg.Acquire = Acquire;
	Release = function(addr) {
		var addr;
	};
	$pkg.Release = Release;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["sync/atomic"] = (function() {
	var $pkg = {}, $init, js, CompareAndSwapInt32, AddInt32;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	CompareAndSwapInt32 = function(addr, old, new$1) {
		var addr, new$1, old;
		if (addr.$get() === old) {
			addr.$set(new$1);
			return true;
		}
		return false;
	};
	$pkg.CompareAndSwapInt32 = CompareAndSwapInt32;
	AddInt32 = function(addr, delta) {
		var addr, delta, new$1;
		new$1 = addr.$get() + delta >> 0;
		addr.$set(new$1);
		return new$1;
	};
	$pkg.AddInt32 = AddInt32;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["sync"] = (function() {
	var $pkg = {}, $init, js, race, runtime, atomic, Pool, Mutex, poolLocalInternal, poolLocal, notifyList, ptrType, sliceType, ptrType$1, chanType, sliceType$1, ptrType$6, ptrType$7, sliceType$4, funcType, ptrType$16, arrayType$2, semWaiters, semAwoken, expunged, allPools, runtime_registerPoolCleanup, runtime_SemacquireMutex, runtime_Semrelease, runtime_notifyListCheck, runtime_canSpin, runtime_nanotime, throw$1, poolCleanup, init, indexLocal, init$1, runtime_doSpin;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	race = $packages["internal/race"];
	runtime = $packages["runtime"];
	atomic = $packages["sync/atomic"];
	Pool = $pkg.Pool = $newType(0, $kindStruct, "sync.Pool", true, "sync", true, function(local_, localSize_, store_, New_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.local = 0;
			this.localSize = 0;
			this.store = sliceType$4.nil;
			this.New = $throwNilPointerError;
			return;
		}
		this.local = local_;
		this.localSize = localSize_;
		this.store = store_;
		this.New = New_;
	});
	Mutex = $pkg.Mutex = $newType(0, $kindStruct, "sync.Mutex", true, "sync", true, function(state_, sema_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.state = 0;
			this.sema = 0;
			return;
		}
		this.state = state_;
		this.sema = sema_;
	});
	poolLocalInternal = $pkg.poolLocalInternal = $newType(0, $kindStruct, "sync.poolLocalInternal", true, "sync", false, function(private$0_, shared_, Mutex_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.private$0 = $ifaceNil;
			this.shared = sliceType$4.nil;
			this.Mutex = new Mutex.ptr(0, 0);
			return;
		}
		this.private$0 = private$0_;
		this.shared = shared_;
		this.Mutex = Mutex_;
	});
	poolLocal = $pkg.poolLocal = $newType(0, $kindStruct, "sync.poolLocal", true, "sync", false, function(poolLocalInternal_, pad_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.poolLocalInternal = new poolLocalInternal.ptr($ifaceNil, sliceType$4.nil, new Mutex.ptr(0, 0));
			this.pad = arrayType$2.zero();
			return;
		}
		this.poolLocalInternal = poolLocalInternal_;
		this.pad = pad_;
	});
	notifyList = $pkg.notifyList = $newType(0, $kindStruct, "sync.notifyList", true, "sync", false, function(wait_, notify_, lock_, head_, tail_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.wait = 0;
			this.notify = 0;
			this.lock = 0;
			this.head = 0;
			this.tail = 0;
			return;
		}
		this.wait = wait_;
		this.notify = notify_;
		this.lock = lock_;
		this.head = head_;
		this.tail = tail_;
	});
	ptrType = $ptrType(Pool);
	sliceType = $sliceType(ptrType);
	ptrType$1 = $ptrType($Uint32);
	chanType = $chanType($Bool, false, false);
	sliceType$1 = $sliceType(chanType);
	ptrType$6 = $ptrType($Int32);
	ptrType$7 = $ptrType(poolLocal);
	sliceType$4 = $sliceType($emptyInterface);
	funcType = $funcType([], [$emptyInterface], false);
	ptrType$16 = $ptrType(Mutex);
	arrayType$2 = $arrayType($Uint8, 100);
	Pool.ptr.prototype.Get = function() {
		var _r, p, x, x$1, x$2, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; p = $f.p; x = $f.x; x$1 = $f.x$1; x$2 = $f.x$2; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		p = this;
		/* */ if (p.store.$length === 0) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (p.store.$length === 0) { */ case 1:
			/* */ if (!(p.New === $throwNilPointerError)) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (!(p.New === $throwNilPointerError)) { */ case 3:
				_r = p.New(); /* */ $s = 5; case 5: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				$s = -1; return _r;
			/* } */ case 4:
			$s = -1; return $ifaceNil;
		/* } */ case 2:
		x$2 = (x = p.store, x$1 = p.store.$length - 1 >> 0, ((x$1 < 0 || x$1 >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + x$1]));
		p.store = $subslice(p.store, 0, (p.store.$length - 1 >> 0));
		$s = -1; return x$2;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Pool.ptr.prototype.Get }; } $f._r = _r; $f.p = p; $f.x = x; $f.x$1 = x$1; $f.x$2 = x$2; $f.$s = $s; $f.$r = $r; return $f;
	};
	Pool.prototype.Get = function() { return this.$val.Get(); };
	Pool.ptr.prototype.Put = function(x) {
		var p, x;
		p = this;
		if ($interfaceIsEqual(x, $ifaceNil)) {
			return;
		}
		p.store = $append(p.store, x);
	};
	Pool.prototype.Put = function(x) { return this.$val.Put(x); };
	runtime_registerPoolCleanup = function(cleanup) {
		var cleanup;
	};
	runtime_SemacquireMutex = function(s, lifo) {
		var _entry, _entry$1, _entry$2, _entry$3, _entry$4, _key, _key$1, _key$2, _r, ch, lifo, s, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _entry$1 = $f._entry$1; _entry$2 = $f._entry$2; _entry$3 = $f._entry$3; _entry$4 = $f._entry$4; _key = $f._key; _key$1 = $f._key$1; _key$2 = $f._key$2; _r = $f._r; ch = $f.ch; lifo = $f.lifo; s = $f.s; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ if (((s.$get() - (_entry = semAwoken[ptrType$1.keyFor(s)], _entry !== undefined ? _entry.v : 0) >>> 0)) === 0) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (((s.$get() - (_entry = semAwoken[ptrType$1.keyFor(s)], _entry !== undefined ? _entry.v : 0) >>> 0)) === 0) { */ case 1:
			ch = new $Chan($Bool, 0);
			if (lifo) {
				_key = s; (semWaiters || $throwRuntimeError("assignment to entry in nil map"))[ptrType$1.keyFor(_key)] = { k: _key, v: $appendSlice(new sliceType$1([ch]), (_entry$1 = semWaiters[ptrType$1.keyFor(s)], _entry$1 !== undefined ? _entry$1.v : sliceType$1.nil)) };
			} else {
				_key$1 = s; (semWaiters || $throwRuntimeError("assignment to entry in nil map"))[ptrType$1.keyFor(_key$1)] = { k: _key$1, v: $append((_entry$2 = semWaiters[ptrType$1.keyFor(s)], _entry$2 !== undefined ? _entry$2.v : sliceType$1.nil), ch) };
			}
			_r = $recv(ch); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_r[0];
			_key$2 = s; (semAwoken || $throwRuntimeError("assignment to entry in nil map"))[ptrType$1.keyFor(_key$2)] = { k: _key$2, v: (_entry$3 = semAwoken[ptrType$1.keyFor(s)], _entry$3 !== undefined ? _entry$3.v : 0) - (1) >>> 0 };
			if ((_entry$4 = semAwoken[ptrType$1.keyFor(s)], _entry$4 !== undefined ? _entry$4.v : 0) === 0) {
				delete semAwoken[ptrType$1.keyFor(s)];
			}
		/* } */ case 2:
		s.$set(s.$get() - (1) >>> 0);
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: runtime_SemacquireMutex }; } $f._entry = _entry; $f._entry$1 = _entry$1; $f._entry$2 = _entry$2; $f._entry$3 = _entry$3; $f._entry$4 = _entry$4; $f._key = _key; $f._key$1 = _key$1; $f._key$2 = _key$2; $f._r = _r; $f.ch = ch; $f.lifo = lifo; $f.s = s; $f.$s = $s; $f.$r = $r; return $f;
	};
	runtime_Semrelease = function(s, handoff) {
		var _entry, _entry$1, _key, _key$1, ch, handoff, s, w, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _entry$1 = $f._entry$1; _key = $f._key; _key$1 = $f._key$1; ch = $f.ch; handoff = $f.handoff; s = $f.s; w = $f.w; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		s.$set(s.$get() + (1) >>> 0);
		w = (_entry = semWaiters[ptrType$1.keyFor(s)], _entry !== undefined ? _entry.v : sliceType$1.nil);
		if (w.$length === 0) {
			$s = -1; return;
		}
		ch = (0 >= w.$length ? ($throwRuntimeError("index out of range"), undefined) : w.$array[w.$offset + 0]);
		w = $subslice(w, 1);
		_key = s; (semWaiters || $throwRuntimeError("assignment to entry in nil map"))[ptrType$1.keyFor(_key)] = { k: _key, v: w };
		if (w.$length === 0) {
			delete semWaiters[ptrType$1.keyFor(s)];
		}
		_key$1 = s; (semAwoken || $throwRuntimeError("assignment to entry in nil map"))[ptrType$1.keyFor(_key$1)] = { k: _key$1, v: (_entry$1 = semAwoken[ptrType$1.keyFor(s)], _entry$1 !== undefined ? _entry$1.v : 0) + (1) >>> 0 };
		$r = $send(ch, true); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: runtime_Semrelease }; } $f._entry = _entry; $f._entry$1 = _entry$1; $f._key = _key; $f._key$1 = _key$1; $f.ch = ch; $f.handoff = handoff; $f.s = s; $f.w = w; $f.$s = $s; $f.$r = $r; return $f;
	};
	runtime_notifyListCheck = function(size) {
		var size;
	};
	runtime_canSpin = function(i) {
		var i;
		return false;
	};
	runtime_nanotime = function() {
		return $mul64($internalize(new ($global.Date)().getTime(), $Int64), new $Int64(0, 1000000));
	};
	throw$1 = function(s) {
		var s;
		$throwRuntimeError($externalize(s, $String));
	};
	Mutex.ptr.prototype.Lock = function() {
		var awoke, delta, iter, m, new$1, old, queueLifo, starving, waitStartTime, x, x$1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; awoke = $f.awoke; delta = $f.delta; iter = $f.iter; m = $f.m; new$1 = $f.new$1; old = $f.old; queueLifo = $f.queueLifo; starving = $f.starving; waitStartTime = $f.waitStartTime; x = $f.x; x$1 = $f.x$1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		m = this;
		if (atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$6(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), 0, 1)) {
			if (false) {
				race.Acquire((m));
			}
			$s = -1; return;
		}
		waitStartTime = new $Int64(0, 0);
		starving = false;
		awoke = false;
		iter = 0;
		old = m.state;
		/* while (true) { */ case 1:
			/* */ if (((old & 5) === 1) && runtime_canSpin(iter)) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (((old & 5) === 1) && runtime_canSpin(iter)) { */ case 3:
				if (!awoke && ((old & 2) === 0) && !(((old >> 3 >> 0) === 0)) && atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$6(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), old, old | 2)) {
					awoke = true;
				}
				runtime_doSpin();
				iter = iter + (1) >> 0;
				old = m.state;
				/* continue; */ $s = 1; continue;
			/* } */ case 4:
			new$1 = old;
			if ((old & 4) === 0) {
				new$1 = new$1 | (1);
			}
			if (!(((old & 5) === 0))) {
				new$1 = new$1 + (8) >> 0;
			}
			if (starving && !(((old & 1) === 0))) {
				new$1 = new$1 | (4);
			}
			if (awoke) {
				if ((new$1 & 2) === 0) {
					throw$1("sync: inconsistent mutex state");
				}
				new$1 = (new$1 & ~(2)) >> 0;
			}
			/* */ if (atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$6(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), old, new$1)) { $s = 5; continue; }
			/* */ $s = 6; continue;
			/* if (atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$6(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), old, new$1)) { */ case 5:
				if ((old & 5) === 0) {
					/* break; */ $s = 2; continue;
				}
				queueLifo = !((waitStartTime.$high === 0 && waitStartTime.$low === 0));
				if ((waitStartTime.$high === 0 && waitStartTime.$low === 0)) {
					waitStartTime = runtime_nanotime();
				}
				$r = runtime_SemacquireMutex((m.$ptr_sema || (m.$ptr_sema = new ptrType$1(function() { return this.$target.sema; }, function($v) { this.$target.sema = $v; }, m))), queueLifo); /* */ $s = 8; case 8: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
				starving = starving || (x = (x$1 = runtime_nanotime(), new $Int64(x$1.$high - waitStartTime.$high, x$1.$low - waitStartTime.$low)), (x.$high > 0 || (x.$high === 0 && x.$low > 1000000)));
				old = m.state;
				if (!(((old & 4) === 0))) {
					if (!(((old & 3) === 0)) || ((old >> 3 >> 0) === 0)) {
						throw$1("sync: inconsistent mutex state");
					}
					delta = -7;
					if (!starving || ((old >> 3 >> 0) === 1)) {
						delta = delta - (4) >> 0;
					}
					atomic.AddInt32((m.$ptr_state || (m.$ptr_state = new ptrType$6(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), delta);
					/* break; */ $s = 2; continue;
				}
				awoke = true;
				iter = 0;
				$s = 7; continue;
			/* } else { */ case 6:
				old = m.state;
			/* } */ case 7:
		/* } */ $s = 1; continue; case 2:
		if (false) {
			race.Acquire((m));
		}
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Mutex.ptr.prototype.Lock }; } $f.awoke = awoke; $f.delta = delta; $f.iter = iter; $f.m = m; $f.new$1 = new$1; $f.old = old; $f.queueLifo = queueLifo; $f.starving = starving; $f.waitStartTime = waitStartTime; $f.x = x; $f.x$1 = x$1; $f.$s = $s; $f.$r = $r; return $f;
	};
	Mutex.prototype.Lock = function() { return this.$val.Lock(); };
	Mutex.ptr.prototype.Unlock = function() {
		var m, new$1, old, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; m = $f.m; new$1 = $f.new$1; old = $f.old; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		m = this;
		if (false) {
			$unused(m.state);
			race.Release((m));
		}
		new$1 = atomic.AddInt32((m.$ptr_state || (m.$ptr_state = new ptrType$6(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), -1);
		if ((((new$1 + 1 >> 0)) & 1) === 0) {
			throw$1("sync: unlock of unlocked mutex");
		}
		/* */ if ((new$1 & 4) === 0) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if ((new$1 & 4) === 0) { */ case 1:
			old = new$1;
			/* while (true) { */ case 4:
				if (((old >> 3 >> 0) === 0) || !(((old & 7) === 0))) {
					$s = -1; return;
				}
				new$1 = ((old - 8 >> 0)) | 2;
				/* */ if (atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$6(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), old, new$1)) { $s = 6; continue; }
				/* */ $s = 7; continue;
				/* if (atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$6(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), old, new$1)) { */ case 6:
					$r = runtime_Semrelease((m.$ptr_sema || (m.$ptr_sema = new ptrType$1(function() { return this.$target.sema; }, function($v) { this.$target.sema = $v; }, m))), false); /* */ $s = 8; case 8: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
					$s = -1; return;
				/* } */ case 7:
				old = m.state;
			/* } */ $s = 4; continue; case 5:
			$s = 3; continue;
		/* } else { */ case 2:
			$r = runtime_Semrelease((m.$ptr_sema || (m.$ptr_sema = new ptrType$1(function() { return this.$target.sema; }, function($v) { this.$target.sema = $v; }, m))), true); /* */ $s = 9; case 9: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 3:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Mutex.ptr.prototype.Unlock }; } $f.m = m; $f.new$1 = new$1; $f.old = old; $f.$s = $s; $f.$r = $r; return $f;
	};
	Mutex.prototype.Unlock = function() { return this.$val.Unlock(); };
	poolCleanup = function() {
		var _i, _i$1, _ref, _ref$1, i, i$1, j, l, p, x;
		_ref = allPools;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			p = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			((i < 0 || i >= allPools.$length) ? ($throwRuntimeError("index out of range"), undefined) : allPools.$array[allPools.$offset + i] = ptrType.nil);
			i$1 = 0;
			while (true) {
				if (!(i$1 < ((p.localSize >> 0)))) { break; }
				l = indexLocal(p.local, i$1);
				l.poolLocalInternal.private$0 = $ifaceNil;
				_ref$1 = l.poolLocalInternal.shared;
				_i$1 = 0;
				while (true) {
					if (!(_i$1 < _ref$1.$length)) { break; }
					j = _i$1;
					(x = l.poolLocalInternal.shared, ((j < 0 || j >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + j] = $ifaceNil));
					_i$1++;
				}
				l.poolLocalInternal.shared = sliceType$4.nil;
				i$1 = i$1 + (1) >> 0;
			}
			p.local = 0;
			p.localSize = 0;
			_i++;
		}
		allPools = new sliceType([]);
	};
	init = function() {
		runtime_registerPoolCleanup(poolCleanup);
	};
	indexLocal = function(l, i) {
		var i, l, lp;
		lp = (((l) + ($imul(((i >>> 0)), 128) >>> 0) >>> 0));
		return ($pointerOfStructConversion(lp, ptrType$7));
	};
	init$1 = function() {
		var n;
		n = new notifyList.ptr(0, 0, 0, 0, 0);
		runtime_notifyListCheck(20);
	};
	runtime_doSpin = function() {
		$throwRuntimeError("native function not implemented: sync.runtime_doSpin");
	};
	ptrType.methods = [{prop: "Get", name: "Get", pkg: "", typ: $funcType([], [$emptyInterface], false)}, {prop: "Put", name: "Put", pkg: "", typ: $funcType([$emptyInterface], [], false)}, {prop: "getSlow", name: "getSlow", pkg: "sync", typ: $funcType([], [$emptyInterface], false)}, {prop: "pin", name: "pin", pkg: "sync", typ: $funcType([], [ptrType$7], false)}, {prop: "pinSlow", name: "pinSlow", pkg: "sync", typ: $funcType([], [ptrType$7], false)}];
	ptrType$16.methods = [{prop: "Lock", name: "Lock", pkg: "", typ: $funcType([], [], false)}, {prop: "Unlock", name: "Unlock", pkg: "", typ: $funcType([], [], false)}];
	Pool.init("sync", [{prop: "local", name: "local", embedded: false, exported: false, typ: $UnsafePointer, tag: ""}, {prop: "localSize", name: "localSize", embedded: false, exported: false, typ: $Uintptr, tag: ""}, {prop: "store", name: "store", embedded: false, exported: false, typ: sliceType$4, tag: ""}, {prop: "New", name: "New", embedded: false, exported: true, typ: funcType, tag: ""}]);
	Mutex.init("sync", [{prop: "state", name: "state", embedded: false, exported: false, typ: $Int32, tag: ""}, {prop: "sema", name: "sema", embedded: false, exported: false, typ: $Uint32, tag: ""}]);
	poolLocalInternal.init("sync", [{prop: "private$0", name: "private", embedded: false, exported: false, typ: $emptyInterface, tag: ""}, {prop: "shared", name: "shared", embedded: false, exported: false, typ: sliceType$4, tag: ""}, {prop: "Mutex", name: "Mutex", embedded: true, exported: true, typ: Mutex, tag: ""}]);
	poolLocal.init("sync", [{prop: "poolLocalInternal", name: "poolLocalInternal", embedded: true, exported: false, typ: poolLocalInternal, tag: ""}, {prop: "pad", name: "pad", embedded: false, exported: false, typ: arrayType$2, tag: ""}]);
	notifyList.init("sync", [{prop: "wait", name: "wait", embedded: false, exported: false, typ: $Uint32, tag: ""}, {prop: "notify", name: "notify", embedded: false, exported: false, typ: $Uint32, tag: ""}, {prop: "lock", name: "lock", embedded: false, exported: false, typ: $Uintptr, tag: ""}, {prop: "head", name: "head", embedded: false, exported: false, typ: $UnsafePointer, tag: ""}, {prop: "tail", name: "tail", embedded: false, exported: false, typ: $UnsafePointer, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = race.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = runtime.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = atomic.$init(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		allPools = sliceType.nil;
		semWaiters = {};
		semAwoken = {};
		expunged = (new Uint8Array(8));
		init();
		init$1();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["io"] = (function() {
	var $pkg = {}, $init, errors, sync, atomic, errWhence, errOffset;
	errors = $packages["errors"];
	sync = $packages["sync"];
	atomic = $packages["sync/atomic"];
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = errors.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = sync.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = atomic.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$pkg.ErrShortWrite = errors.New("short write");
		$pkg.ErrShortBuffer = errors.New("short buffer");
		$pkg.EOF = errors.New("EOF");
		$pkg.ErrUnexpectedEOF = errors.New("unexpected EOF");
		$pkg.ErrNoProgress = errors.New("multiple Read calls return no data or error");
		errWhence = errors.New("Seek: invalid whence");
		errOffset = errors.New("Seek: invalid offset");
		$pkg.ErrClosedPipe = errors.New("io: read/write on closed pipe");
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["unicode"] = (function() {
	var $pkg = {}, $init, RangeTable, Range16, Range32, sliceType, sliceType$1, _White_Space, IsSpace, is16, is32, isExcludingLatin;
	RangeTable = $pkg.RangeTable = $newType(0, $kindStruct, "unicode.RangeTable", true, "unicode", true, function(R16_, R32_, LatinOffset_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.R16 = sliceType.nil;
			this.R32 = sliceType$1.nil;
			this.LatinOffset = 0;
			return;
		}
		this.R16 = R16_;
		this.R32 = R32_;
		this.LatinOffset = LatinOffset_;
	});
	Range16 = $pkg.Range16 = $newType(0, $kindStruct, "unicode.Range16", true, "unicode", true, function(Lo_, Hi_, Stride_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Lo = 0;
			this.Hi = 0;
			this.Stride = 0;
			return;
		}
		this.Lo = Lo_;
		this.Hi = Hi_;
		this.Stride = Stride_;
	});
	Range32 = $pkg.Range32 = $newType(0, $kindStruct, "unicode.Range32", true, "unicode", true, function(Lo_, Hi_, Stride_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Lo = 0;
			this.Hi = 0;
			this.Stride = 0;
			return;
		}
		this.Lo = Lo_;
		this.Hi = Hi_;
		this.Stride = Stride_;
	});
	sliceType = $sliceType(Range16);
	sliceType$1 = $sliceType(Range32);
	IsSpace = function(r) {
		var _1, r;
		if (((r >>> 0)) <= 255) {
			_1 = r;
			if ((_1 === (9)) || (_1 === (10)) || (_1 === (11)) || (_1 === (12)) || (_1 === (13)) || (_1 === (32)) || (_1 === (133)) || (_1 === (160))) {
				return true;
			}
			return false;
		}
		return isExcludingLatin($pkg.White_Space, r);
	};
	$pkg.IsSpace = IsSpace;
	is16 = function(ranges, r) {
		var _i, _q, _r, _r$1, _ref, hi, i, lo, m, r, range_, range_$1, ranges;
		if (ranges.$length <= 18 || r <= 255) {
			_ref = ranges;
			_i = 0;
			while (true) {
				if (!(_i < _ref.$length)) { break; }
				i = _i;
				range_ = ((i < 0 || i >= ranges.$length) ? ($throwRuntimeError("index out of range"), undefined) : ranges.$array[ranges.$offset + i]);
				if (r < range_.Lo) {
					return false;
				}
				if (r <= range_.Hi) {
					return (range_.Stride === 1) || ((_r = ((r - range_.Lo << 16 >>> 16)) % range_.Stride, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) === 0);
				}
				_i++;
			}
			return false;
		}
		lo = 0;
		hi = ranges.$length;
		while (true) {
			if (!(lo < hi)) { break; }
			m = lo + (_q = ((hi - lo >> 0)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0;
			range_$1 = ((m < 0 || m >= ranges.$length) ? ($throwRuntimeError("index out of range"), undefined) : ranges.$array[ranges.$offset + m]);
			if (range_$1.Lo <= r && r <= range_$1.Hi) {
				return (range_$1.Stride === 1) || ((_r$1 = ((r - range_$1.Lo << 16 >>> 16)) % range_$1.Stride, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) === 0);
			}
			if (r < range_$1.Lo) {
				hi = m;
			} else {
				lo = m + 1 >> 0;
			}
		}
		return false;
	};
	is32 = function(ranges, r) {
		var _i, _q, _r, _r$1, _ref, hi, i, lo, m, r, range_, range_$1, ranges;
		if (ranges.$length <= 18) {
			_ref = ranges;
			_i = 0;
			while (true) {
				if (!(_i < _ref.$length)) { break; }
				i = _i;
				range_ = ((i < 0 || i >= ranges.$length) ? ($throwRuntimeError("index out of range"), undefined) : ranges.$array[ranges.$offset + i]);
				if (r < range_.Lo) {
					return false;
				}
				if (r <= range_.Hi) {
					return (range_.Stride === 1) || ((_r = ((r - range_.Lo >>> 0)) % range_.Stride, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) === 0);
				}
				_i++;
			}
			return false;
		}
		lo = 0;
		hi = ranges.$length;
		while (true) {
			if (!(lo < hi)) { break; }
			m = lo + (_q = ((hi - lo >> 0)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0;
			range_$1 = $clone(((m < 0 || m >= ranges.$length) ? ($throwRuntimeError("index out of range"), undefined) : ranges.$array[ranges.$offset + m]), Range32);
			if (range_$1.Lo <= r && r <= range_$1.Hi) {
				return (range_$1.Stride === 1) || ((_r$1 = ((r - range_$1.Lo >>> 0)) % range_$1.Stride, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) === 0);
			}
			if (r < range_$1.Lo) {
				hi = m;
			} else {
				lo = m + 1 >> 0;
			}
		}
		return false;
	};
	isExcludingLatin = function(rangeTab, r) {
		var off, r, r16, r32, rangeTab, x;
		r16 = rangeTab.R16;
		off = rangeTab.LatinOffset;
		if (r16.$length > off && r <= (((x = r16.$length - 1 >> 0, ((x < 0 || x >= r16.$length) ? ($throwRuntimeError("index out of range"), undefined) : r16.$array[r16.$offset + x])).Hi >> 0))) {
			return is16($subslice(r16, off), ((r << 16 >>> 16)));
		}
		r32 = rangeTab.R32;
		if (r32.$length > 0 && r >= (((0 >= r32.$length ? ($throwRuntimeError("index out of range"), undefined) : r32.$array[r32.$offset + 0]).Lo >> 0))) {
			return is32(r32, ((r >>> 0)));
		}
		return false;
	};
	RangeTable.init("", [{prop: "R16", name: "R16", embedded: false, exported: true, typ: sliceType, tag: ""}, {prop: "R32", name: "R32", embedded: false, exported: true, typ: sliceType$1, tag: ""}, {prop: "LatinOffset", name: "LatinOffset", embedded: false, exported: true, typ: $Int, tag: ""}]);
	Range16.init("", [{prop: "Lo", name: "Lo", embedded: false, exported: true, typ: $Uint16, tag: ""}, {prop: "Hi", name: "Hi", embedded: false, exported: true, typ: $Uint16, tag: ""}, {prop: "Stride", name: "Stride", embedded: false, exported: true, typ: $Uint16, tag: ""}]);
	Range32.init("", [{prop: "Lo", name: "Lo", embedded: false, exported: true, typ: $Uint32, tag: ""}, {prop: "Hi", name: "Hi", embedded: false, exported: true, typ: $Uint32, tag: ""}, {prop: "Stride", name: "Stride", embedded: false, exported: true, typ: $Uint32, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_White_Space = new RangeTable.ptr(new sliceType([new Range16.ptr(9, 13, 1), new Range16.ptr(32, 32, 1), new Range16.ptr(133, 133, 1), new Range16.ptr(160, 160, 1), new Range16.ptr(5760, 5760, 1), new Range16.ptr(8192, 8202, 1), new Range16.ptr(8232, 8233, 1), new Range16.ptr(8239, 8239, 1), new Range16.ptr(8287, 8287, 1), new Range16.ptr(12288, 12288, 1)]), sliceType$1.nil, 4);
		$pkg.White_Space = _White_Space;
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["strings"] = (function() {
	var $pkg = {}, $init, errors, js, bytealg, io, sync, unicode, utf8, HasPrefix, TrimLeftFunc, TrimRightFunc, TrimFunc, indexFunc, lastIndexFunc, TrimSpace, TrimPrefix;
	errors = $packages["errors"];
	js = $packages["github.com/gopherjs/gopherjs/js"];
	bytealg = $packages["internal/bytealg"];
	io = $packages["io"];
	sync = $packages["sync"];
	unicode = $packages["unicode"];
	utf8 = $packages["unicode/utf8"];
	HasPrefix = function(s, prefix) {
		var prefix, s;
		return s.length >= prefix.length && $substring(s, 0, prefix.length) === prefix;
	};
	$pkg.HasPrefix = HasPrefix;
	TrimLeftFunc = function(s, f) {
		var _r, f, i, s, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; f = $f.f; i = $f.i; s = $f.s; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = indexFunc(s, f, false); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		i = _r;
		if (i === -1) {
			$s = -1; return "";
		}
		$s = -1; return $substring(s, i);
		/* */ } return; } if ($f === undefined) { $f = { $blk: TrimLeftFunc }; } $f._r = _r; $f.f = f; $f.i = i; $f.s = s; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.TrimLeftFunc = TrimLeftFunc;
	TrimRightFunc = function(s, f) {
		var _r, _tuple, f, i, s, wid, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; f = $f.f; i = $f.i; s = $f.s; wid = $f.wid; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = lastIndexFunc(s, f, false); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		i = _r;
		if (i >= 0 && s.charCodeAt(i) >= 128) {
			_tuple = utf8.DecodeRuneInString($substring(s, i));
			wid = _tuple[1];
			i = i + (wid) >> 0;
		} else {
			i = i + (1) >> 0;
		}
		$s = -1; return $substring(s, 0, i);
		/* */ } return; } if ($f === undefined) { $f = { $blk: TrimRightFunc }; } $f._r = _r; $f._tuple = _tuple; $f.f = f; $f.i = i; $f.s = s; $f.wid = wid; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.TrimRightFunc = TrimRightFunc;
	TrimFunc = function(s, f) {
		var _r, _r$1, f, s, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; f = $f.f; s = $f.s; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = TrimLeftFunc(s, f); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_r$1 = TrimRightFunc(_r, f); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		$s = -1; return _r$1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: TrimFunc }; } $f._r = _r; $f._r$1 = _r$1; $f.f = f; $f.s = s; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.TrimFunc = TrimFunc;
	indexFunc = function(s, f, truth) {
		var _i, _r, _ref, _rune, f, i, r, s, truth, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _i = $f._i; _r = $f._r; _ref = $f._ref; _rune = $f._rune; f = $f.f; i = $f.i; r = $f.r; s = $f.s; truth = $f.truth; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_ref = s;
		_i = 0;
		/* while (true) { */ case 1:
			/* if (!(_i < _ref.length)) { break; } */ if(!(_i < _ref.length)) { $s = 2; continue; }
			_rune = $decodeRune(_ref, _i);
			i = _i;
			r = _rune[0];
			_r = f(r); /* */ $s = 5; case 5: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			/* */ if (_r === truth) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (_r === truth) { */ case 3:
				$s = -1; return i;
			/* } */ case 4:
			_i += _rune[1];
		/* } */ $s = 1; continue; case 2:
		$s = -1; return -1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: indexFunc }; } $f._i = _i; $f._r = _r; $f._ref = _ref; $f._rune = _rune; $f.f = f; $f.i = i; $f.r = r; $f.s = s; $f.truth = truth; $f.$s = $s; $f.$r = $r; return $f;
	};
	lastIndexFunc = function(s, f, truth) {
		var _r, _tuple, f, i, r, s, size, truth, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; f = $f.f; i = $f.i; r = $f.r; s = $f.s; size = $f.size; truth = $f.truth; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		i = s.length;
		/* while (true) { */ case 1:
			/* if (!(i > 0)) { break; } */ if(!(i > 0)) { $s = 2; continue; }
			_tuple = utf8.DecodeLastRuneInString($substring(s, 0, i));
			r = _tuple[0];
			size = _tuple[1];
			i = i - (size) >> 0;
			_r = f(r); /* */ $s = 5; case 5: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			/* */ if (_r === truth) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (_r === truth) { */ case 3:
				$s = -1; return i;
			/* } */ case 4:
		/* } */ $s = 1; continue; case 2:
		$s = -1; return -1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: lastIndexFunc }; } $f._r = _r; $f._tuple = _tuple; $f.f = f; $f.i = i; $f.r = r; $f.s = s; $f.size = size; $f.truth = truth; $f.$s = $s; $f.$r = $r; return $f;
	};
	TrimSpace = function(s) {
		var _r, s, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; s = $f.s; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = TrimFunc(s, unicode.IsSpace); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: TrimSpace }; } $f._r = _r; $f.s = s; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.TrimSpace = TrimSpace;
	TrimPrefix = function(s, prefix) {
		var prefix, s;
		if (HasPrefix(s, prefix)) {
			return $substring(s, prefix.length);
		}
		return s;
	};
	$pkg.TrimPrefix = TrimPrefix;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = errors.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = js.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = bytealg.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = io.$init(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = sync.$init(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = unicode.$init(); /* */ $s = 6; case 6: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = utf8.$init(); /* */ $s = 7; case 7: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["github.com/siongui/gopherjs-input-suggest"] = (function() {
	var $pkg = {}, $init, godom, strconv, strings, SuggestMenuStateMachine, ptrType, ptrType$1, sliceType, sliceType$1, funcType, sliceType$2, funcType$1, sliceType$3, sliceType$4, funcType$2, css, state, keyEventHandler, NewSuggestMenuStateMachine, appendCssToHead, createSuggestMenu, UpdateSuggestion, BindSuggest;
	godom = $packages["github.com/siongui/godom"];
	strconv = $packages["strconv"];
	strings = $packages["strings"];
	SuggestMenuStateMachine = $pkg.SuggestMenuStateMachine = $newType(0, $kindStruct, "suggest.SuggestMenuStateMachine", true, "github.com/siongui/gopherjs-input-suggest", true, function(Input_, SuggestMenu_, FuncSugguestWords_, CurrentSelectedWordIndex_, IsShowSuggestMenu_, SuggestedWordsDivs_, OriginalWord_, SuggestedWords_, HighlightSelectedWordHandler_, UpdateSuggestMenuHandler_, HideSuggestMenuHandler_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Input = ptrType$1.nil;
			this.SuggestMenu = ptrType$1.nil;
			this.FuncSugguestWords = $throwNilPointerError;
			this.CurrentSelectedWordIndex = 0;
			this.IsShowSuggestMenu = false;
			this.SuggestedWordsDivs = sliceType.nil;
			this.OriginalWord = "";
			this.SuggestedWords = sliceType$1.nil;
			this.HighlightSelectedWordHandler = sliceType$2.nil;
			this.UpdateSuggestMenuHandler = sliceType$2.nil;
			this.HideSuggestMenuHandler = sliceType$3.nil;
			return;
		}
		this.Input = Input_;
		this.SuggestMenu = SuggestMenu_;
		this.FuncSugguestWords = FuncSugguestWords_;
		this.CurrentSelectedWordIndex = CurrentSelectedWordIndex_;
		this.IsShowSuggestMenu = IsShowSuggestMenu_;
		this.SuggestedWordsDivs = SuggestedWordsDivs_;
		this.OriginalWord = OriginalWord_;
		this.SuggestedWords = SuggestedWords_;
		this.HighlightSelectedWordHandler = HighlightSelectedWordHandler_;
		this.UpdateSuggestMenuHandler = UpdateSuggestMenuHandler_;
		this.HideSuggestMenuHandler = HideSuggestMenuHandler_;
	});
	ptrType = $ptrType(SuggestMenuStateMachine);
	ptrType$1 = $ptrType(godom.Object);
	sliceType = $sliceType(ptrType$1);
	sliceType$1 = $sliceType($String);
	funcType = $funcType([$String], [], false);
	sliceType$2 = $sliceType(funcType);
	funcType$1 = $funcType([], [], false);
	sliceType$3 = $sliceType(funcType$1);
	sliceType$4 = $sliceType($emptyInterface);
	funcType$2 = $funcType([$String], [sliceType$1], false);
	keyEventHandler = function(keycode) {
		var keycode, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; keycode = $f.keycode; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ if (keycode === 13) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (keycode === 13) { */ case 1:
			$r = state.HideSuggestMenu(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			$s = -1; return;
		/* } */ case 2:
		if (keycode === 37) {
			$s = -1; return;
		}
		if (keycode === 39) {
			$s = -1; return;
		}
		/* */ if (keycode === 38) { $s = 4; continue; }
		/* */ $s = 5; continue;
		/* if (keycode === 38) { */ case 4:
			$r = state.HandleArrowUp(); /* */ $s = 6; case 6: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			$s = -1; return;
		/* } */ case 5:
		/* */ if (keycode === 40) { $s = 7; continue; }
		/* */ $s = 8; continue;
		/* if (keycode === 40) { */ case 7:
			$r = state.HandleArrowDown(); /* */ $s = 9; case 9: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			$s = -1; return;
		/* } */ case 8:
		/* */ if (keycode === 27) { $s = 10; continue; }
		/* */ $s = 11; continue;
		/* if (keycode === 27) { */ case 10:
			$r = state.HandleESC(); /* */ $s = 12; case 12: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			$s = -1; return;
		/* } */ case 11:
		$r = UpdateSuggestion(); /* */ $s = 13; case 13: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: keyEventHandler }; } $f.keycode = keycode; $f.$s = $s; $f.$r = $r; return $f;
	};
	NewSuggestMenuStateMachine = function(input, sm, fnSugguestWords) {
		var fnSugguestWords, input, sm;
		return new SuggestMenuStateMachine.ptr(input, sm, fnSugguestWords, -1, false, sliceType.nil, "", sliceType$1.nil, sliceType$2.nil, sliceType$2.nil, sliceType$3.nil);
	};
	$pkg.NewSuggestMenuStateMachine = NewSuggestMenuStateMachine;
	SuggestMenuStateMachine.ptr.prototype.GetWord = function() {
		var _r, s, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; s = $f.s; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		s = this;
		_r = strings.TrimSpace(s.Input.Value()); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: SuggestMenuStateMachine.ptr.prototype.GetWord }; } $f._r = _r; $f.s = s; $f.$s = $s; $f.$r = $r; return $f;
	};
	SuggestMenuStateMachine.prototype.GetWord = function() { return this.$val.GetWord(); };
	SuggestMenuStateMachine.ptr.prototype.SetWord = function(word) {
		var s, word;
		s = this;
		s.Input.SetValue(word);
	};
	SuggestMenuStateMachine.prototype.SetWord = function(word) { return this.$val.SetWord(word); };
	SuggestMenuStateMachine.ptr.prototype.HideSuggestMenu = function() {
		var _i, _ref, handler, s, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _i = $f._i; _ref = $f._ref; handler = $f.handler; s = $f.s; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		s = this;
		s.SuggestMenu.ClassList().Add("invisible-used-in-suggest");
		s.IsShowSuggestMenu = false;
		_ref = state.HideSuggestMenuHandler;
		_i = 0;
		/* while (true) { */ case 1:
			/* if (!(_i < _ref.$length)) { break; } */ if(!(_i < _ref.$length)) { $s = 2; continue; }
			handler = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			$r = handler(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			_i++;
		/* } */ $s = 1; continue; case 2:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: SuggestMenuStateMachine.ptr.prototype.HideSuggestMenu }; } $f._i = _i; $f._ref = _ref; $f.handler = handler; $f.s = s; $f.$s = $s; $f.$r = $r; return $f;
	};
	SuggestMenuStateMachine.prototype.HideSuggestMenu = function() { return this.$val.HideSuggestMenu(); };
	SuggestMenuStateMachine.ptr.prototype.ShowSuggestMenu = function() {
		var s;
		s = this;
		s.SuggestMenu.ClassList().Remove("invisible-used-in-suggest");
		s.IsShowSuggestMenu = true;
	};
	SuggestMenuStateMachine.prototype.ShowSuggestMenu = function() { return this.$val.ShowSuggestMenu(); };
	SuggestMenuStateMachine.ptr.prototype.setSuggestMenuPosition = function() {
		var rect, s;
		s = this;
		rect = s.Input.GetBoundingClientRect();
		s.SuggestMenu.Style().SetMaxWidth(strconv.FormatFloat(rect.Width(), 102, -1, 64) + "px");
	};
	SuggestMenuStateMachine.prototype.setSuggestMenuPosition = function() { return this.$val.setSuggestMenuPosition(); };
	SuggestMenuStateMachine.ptr.prototype.registerMouseenterEventToWordDiv = function(index, word, wordDiv) {
		var index, s, word, wordDiv;
		s = this;
		wordDiv.AddEventListener("mouseenter", (function $b(event) {
			var event, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; event = $f.event; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			if (s.CurrentSelectedWordIndex > -1 && s.CurrentSelectedWordIndex < s.SuggestedWords.$length) {
				s.UnhighlightSelectedWord(s.CurrentSelectedWordIndex);
			}
			s.CurrentSelectedWordIndex = index;
			$r = s.HighlightSelectedWord(s.CurrentSelectedWordIndex); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			s.SetWord(word);
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f.event = event; $f.$s = $s; $f.$r = $r; return $f;
		}), new sliceType$4([]));
	};
	SuggestMenuStateMachine.prototype.registerMouseenterEventToWordDiv = function(index, word, wordDiv) { return this.$val.registerMouseenterEventToWordDiv(index, word, wordDiv); };
	SuggestMenuStateMachine.ptr.prototype.registerClickEventToWordDiv = function(wordDiv) {
		var s, wordDiv;
		s = this;
		wordDiv.AddEventListener("click", (function $b(event) {
			var event, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; event = $f.event; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			s.SuggestedWords = sliceType$1.nil;
			$r = s.HideSuggestMenu(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			s.Input.Focus();
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f.event = event; $f.$s = $s; $f.$r = $r; return $f;
		}), new sliceType$4([]));
	};
	SuggestMenuStateMachine.prototype.registerClickEventToWordDiv = function(wordDiv) { return this.$val.registerClickEventToWordDiv(wordDiv); };
	SuggestMenuStateMachine.ptr.prototype.appendWords = function(words) {
		var _i, _ref, bold, div, index, s, suffix, word, words;
		s = this;
		s.SuggestedWordsDivs = sliceType.nil;
		s.SuggestMenu.RemoveAllChildNodes();
		_ref = words;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			index = _i;
			word = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			div = godom.Document.CreateElement("div");
			s.registerMouseenterEventToWordDiv(index, word, div);
			s.registerClickEventToWordDiv(div);
			bold = godom.Document.CreateElement("strong");
			bold.SetTextContent(s.OriginalWord);
			div.AppendChild(bold);
			suffix = godom.Document.CreateTextNode(strings.TrimPrefix(word, s.OriginalWord));
			div.AppendChild(suffix);
			s.SuggestedWordsDivs = $append(s.SuggestedWordsDivs, div);
			s.SuggestMenu.AppendChild(div);
			_i++;
		}
	};
	SuggestMenuStateMachine.prototype.appendWords = function(words) { return this.$val.appendWords(words); };
	SuggestMenuStateMachine.ptr.prototype.HighlightSelectedWord = function(index) {
		var _i, _ref, handler, index, s, x, x$1, x$2, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _i = $f._i; _ref = $f._ref; handler = $f.handler; index = $f.index; s = $f.s; x = $f.x; x$1 = $f.x$1; x$2 = $f.x$2; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		s = this;
		(x = s.SuggestedWordsDivs, ((index < 0 || index >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + index])).ClassList().Add("wordSelected");
		_ref = state.HighlightSelectedWordHandler;
		_i = 0;
		/* while (true) { */ case 1:
			/* if (!(_i < _ref.$length)) { break; } */ if(!(_i < _ref.$length)) { $s = 2; continue; }
			handler = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			$r = handler((x$1 = s.SuggestedWords, x$2 = s.CurrentSelectedWordIndex, ((x$2 < 0 || x$2 >= x$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$1.$array[x$1.$offset + x$2]))); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			_i++;
		/* } */ $s = 1; continue; case 2:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: SuggestMenuStateMachine.ptr.prototype.HighlightSelectedWord }; } $f._i = _i; $f._ref = _ref; $f.handler = handler; $f.index = index; $f.s = s; $f.x = x; $f.x$1 = x$1; $f.x$2 = x$2; $f.$s = $s; $f.$r = $r; return $f;
	};
	SuggestMenuStateMachine.prototype.HighlightSelectedWord = function(index) { return this.$val.HighlightSelectedWord(index); };
	SuggestMenuStateMachine.ptr.prototype.UnhighlightSelectedWord = function(index) {
		var index, s, x;
		s = this;
		(x = s.SuggestedWordsDivs, ((index < 0 || index >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + index])).ClassList().Remove("wordSelected");
	};
	SuggestMenuStateMachine.prototype.UnhighlightSelectedWord = function(index) { return this.$val.UnhighlightSelectedWord(index); };
	SuggestMenuStateMachine.ptr.prototype.UpdateSuggestMenu = function(word) {
		var _i, _r, _ref, handler, s, word, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _i = $f._i; _r = $f._r; _ref = $f._ref; handler = $f.handler; s = $f.s; word = $f.word; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		s = this;
		if (s.OriginalWord === word) {
			$s = -1; return;
		}
		s.OriginalWord = word;
		s.CurrentSelectedWordIndex = -1;
		_r = s.FuncSugguestWords(word); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		s.SuggestedWords = _r;
		/* */ if (s.SuggestedWords.$length === 0) { $s = 2; continue; }
		/* */ $s = 3; continue;
		/* if (s.SuggestedWords.$length === 0) { */ case 2:
			$r = s.HideSuggestMenu(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			$s = 4; continue;
		/* } else { */ case 3:
			s.setSuggestMenuPosition();
			s.appendWords(s.SuggestedWords);
			s.ShowSuggestMenu();
		/* } */ case 4:
		_ref = state.UpdateSuggestMenuHandler;
		_i = 0;
		/* while (true) { */ case 6:
			/* if (!(_i < _ref.$length)) { break; } */ if(!(_i < _ref.$length)) { $s = 7; continue; }
			handler = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			$r = handler(word); /* */ $s = 8; case 8: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			_i++;
		/* } */ $s = 6; continue; case 7:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: SuggestMenuStateMachine.ptr.prototype.UpdateSuggestMenu }; } $f._i = _i; $f._r = _r; $f._ref = _ref; $f.handler = handler; $f.s = s; $f.word = word; $f.$s = $s; $f.$r = $r; return $f;
	};
	SuggestMenuStateMachine.prototype.UpdateSuggestMenu = function(word) { return this.$val.UpdateSuggestMenu(word); };
	SuggestMenuStateMachine.ptr.prototype.HandleArrowUp = function() {
		var _r, s, w, x, x$1, x$2, x$3, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; s = $f.s; w = $f.w; x = $f.x; x$1 = $f.x$1; x$2 = $f.x$2; x$3 = $f.x$3; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		s = this;
		/* */ if (!s.IsShowSuggestMenu) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!s.IsShowSuggestMenu) { */ case 1:
			_r = s.GetWord(); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			w = _r;
			/* */ if (!(w === "")) { $s = 4; continue; }
			/* */ $s = 5; continue;
			/* if (!(w === "")) { */ case 4:
				$r = s.UpdateSuggestMenu(w); /* */ $s = 6; case 6: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			/* } */ case 5:
			$s = -1; return;
		/* } */ case 2:
		s.CurrentSelectedWordIndex = s.CurrentSelectedWordIndex - (1) >> 0;
		/* */ if (s.CurrentSelectedWordIndex === -2) { $s = 7; continue; }
		/* */ if (s.CurrentSelectedWordIndex === -1) { $s = 8; continue; }
		/* */ $s = 9; continue;
		/* if (s.CurrentSelectedWordIndex === -2) { */ case 7:
			s.CurrentSelectedWordIndex = s.SuggestedWordsDivs.$length - 1 >> 0;
			$r = s.HighlightSelectedWord(s.CurrentSelectedWordIndex); /* */ $s = 11; case 11: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			s.SetWord((x = s.SuggestedWords, x$1 = s.CurrentSelectedWordIndex, ((x$1 < 0 || x$1 >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + x$1])));
			$s = 10; continue;
		/* } else if (s.CurrentSelectedWordIndex === -1) { */ case 8:
			s.UnhighlightSelectedWord(0);
			s.SetWord(s.OriginalWord);
			$s = 10; continue;
		/* } else { */ case 9:
			$r = s.HighlightSelectedWord(s.CurrentSelectedWordIndex); /* */ $s = 12; case 12: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			s.SetWord((x$2 = s.SuggestedWords, x$3 = s.CurrentSelectedWordIndex, ((x$3 < 0 || x$3 >= x$2.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$2.$array[x$2.$offset + x$3])));
			if (s.CurrentSelectedWordIndex < (s.SuggestedWordsDivs.$length - 1 >> 0)) {
				s.UnhighlightSelectedWord(s.CurrentSelectedWordIndex + 1 >> 0);
			}
		/* } */ case 10:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: SuggestMenuStateMachine.ptr.prototype.HandleArrowUp }; } $f._r = _r; $f.s = s; $f.w = w; $f.x = x; $f.x$1 = x$1; $f.x$2 = x$2; $f.x$3 = x$3; $f.$s = $s; $f.$r = $r; return $f;
	};
	SuggestMenuStateMachine.prototype.HandleArrowUp = function() { return this.$val.HandleArrowUp(); };
	SuggestMenuStateMachine.ptr.prototype.HandleArrowDown = function() {
		var _r, s, w, x, x$1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; s = $f.s; w = $f.w; x = $f.x; x$1 = $f.x$1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		s = this;
		/* */ if (!s.IsShowSuggestMenu) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!s.IsShowSuggestMenu) { */ case 1:
			_r = s.GetWord(); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			w = _r;
			/* */ if (!(w === "")) { $s = 4; continue; }
			/* */ $s = 5; continue;
			/* if (!(w === "")) { */ case 4:
				$r = s.UpdateSuggestMenu(w); /* */ $s = 6; case 6: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			/* } */ case 5:
			$s = -1; return;
		/* } */ case 2:
		s.CurrentSelectedWordIndex = s.CurrentSelectedWordIndex + (1) >> 0;
		/* */ if (s.CurrentSelectedWordIndex === s.SuggestedWordsDivs.$length) { $s = 7; continue; }
		/* */ $s = 8; continue;
		/* if (s.CurrentSelectedWordIndex === s.SuggestedWordsDivs.$length) { */ case 7:
			s.UnhighlightSelectedWord(s.CurrentSelectedWordIndex - 1 >> 0);
			s.CurrentSelectedWordIndex = -1;
			s.SetWord(s.OriginalWord);
			$s = 9; continue;
		/* } else { */ case 8:
			$r = s.HighlightSelectedWord(s.CurrentSelectedWordIndex); /* */ $s = 10; case 10: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			s.SetWord((x = s.SuggestedWords, x$1 = s.CurrentSelectedWordIndex, ((x$1 < 0 || x$1 >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + x$1])));
			if (s.CurrentSelectedWordIndex > 0) {
				s.UnhighlightSelectedWord(s.CurrentSelectedWordIndex - 1 >> 0);
			}
		/* } */ case 9:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: SuggestMenuStateMachine.ptr.prototype.HandleArrowDown }; } $f._r = _r; $f.s = s; $f.w = w; $f.x = x; $f.x$1 = x$1; $f.$s = $s; $f.$r = $r; return $f;
	};
	SuggestMenuStateMachine.prototype.HandleArrowDown = function() { return this.$val.HandleArrowDown(); };
	SuggestMenuStateMachine.ptr.prototype.HandleESC = function() {
		var s, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; s = $f.s; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		s = this;
		if (!s.IsShowSuggestMenu) {
			s.SetWord("");
			s.SuggestedWords = sliceType$1.nil;
			$s = -1; return;
		}
		s.SetWord(s.OriginalWord);
		s.SuggestedWords = sliceType$1.nil;
		$r = s.HideSuggestMenu(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: SuggestMenuStateMachine.ptr.prototype.HandleESC }; } $f.s = s; $f.$s = $s; $f.$r = $r; return $f;
	};
	SuggestMenuStateMachine.prototype.HandleESC = function() { return this.$val.HandleESC(); };
	appendCssToHead = function() {
		var s;
		s = godom.Document.CreateElement("style");
		s.SetInnerHTML(css);
		godom.Document.QuerySelector("head").AppendChild(s);
	};
	createSuggestMenu = function() {
		var sm;
		sm = godom.Document.CreateElement("div");
		sm.ClassList().Add("suggest");
		sm.ClassList().Add("invisible-used-in-suggest");
		return sm;
	};
	UpdateSuggestion = function() {
		var _r, w, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; w = $f.w; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = state.GetWord(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		w = _r;
		/* */ if (w === "") { $s = 2; continue; }
		/* */ $s = 3; continue;
		/* if (w === "") { */ case 2:
			state.OriginalWord = "";
			$r = state.HideSuggestMenu(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			$s = 4; continue;
		/* } else { */ case 3:
			$r = state.UpdateSuggestMenu(w); /* */ $s = 6; case 6: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 4:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: UpdateSuggestion }; } $f._r = _r; $f.w = w; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.UpdateSuggestion = UpdateSuggestion;
	BindSuggest = function(id, fnSugguestWords) {
		var fnSugguestWords, id, input, sm;
		input = godom.Document.GetElementById(id);
		appendCssToHead();
		sm = createSuggestMenu();
		input.AppendAfter(sm);
		state = NewSuggestMenuStateMachine(input, sm, fnSugguestWords);
		input.AddEventListener("keyup", (function $b(e) {
			var e, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; e = $f.e; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			$r = keyEventHandler($clone(e, godom.Event).KeyCode()); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f.e = e; $f.$s = $s; $f.$r = $r; return $f;
		}), new sliceType$4([]));
		return state;
	};
	$pkg.BindSuggest = BindSuggest;
	ptrType.methods = [{prop: "GetWord", name: "GetWord", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetWord", name: "SetWord", pkg: "", typ: $funcType([$String], [], false)}, {prop: "HideSuggestMenu", name: "HideSuggestMenu", pkg: "", typ: $funcType([], [], false)}, {prop: "ShowSuggestMenu", name: "ShowSuggestMenu", pkg: "", typ: $funcType([], [], false)}, {prop: "setSuggestMenuPosition", name: "setSuggestMenuPosition", pkg: "github.com/siongui/gopherjs-input-suggest", typ: $funcType([], [], false)}, {prop: "registerMouseenterEventToWordDiv", name: "registerMouseenterEventToWordDiv", pkg: "github.com/siongui/gopherjs-input-suggest", typ: $funcType([$Int, $String, ptrType$1], [], false)}, {prop: "registerClickEventToWordDiv", name: "registerClickEventToWordDiv", pkg: "github.com/siongui/gopherjs-input-suggest", typ: $funcType([ptrType$1], [], false)}, {prop: "appendWords", name: "appendWords", pkg: "github.com/siongui/gopherjs-input-suggest", typ: $funcType([sliceType$1], [], false)}, {prop: "HighlightSelectedWord", name: "HighlightSelectedWord", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "UnhighlightSelectedWord", name: "UnhighlightSelectedWord", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "UpdateSuggestMenu", name: "UpdateSuggestMenu", pkg: "", typ: $funcType([$String], [], false)}, {prop: "HandleArrowUp", name: "HandleArrowUp", pkg: "", typ: $funcType([], [], false)}, {prop: "HandleArrowDown", name: "HandleArrowDown", pkg: "", typ: $funcType([], [], false)}, {prop: "HandleESC", name: "HandleESC", pkg: "", typ: $funcType([], [], false)}];
	SuggestMenuStateMachine.init("", [{prop: "Input", name: "Input", embedded: false, exported: true, typ: ptrType$1, tag: ""}, {prop: "SuggestMenu", name: "SuggestMenu", embedded: false, exported: true, typ: ptrType$1, tag: ""}, {prop: "FuncSugguestWords", name: "FuncSugguestWords", embedded: false, exported: true, typ: funcType$2, tag: ""}, {prop: "CurrentSelectedWordIndex", name: "CurrentSelectedWordIndex", embedded: false, exported: true, typ: $Int, tag: ""}, {prop: "IsShowSuggestMenu", name: "IsShowSuggestMenu", embedded: false, exported: true, typ: $Bool, tag: ""}, {prop: "SuggestedWordsDivs", name: "SuggestedWordsDivs", embedded: false, exported: true, typ: sliceType, tag: ""}, {prop: "OriginalWord", name: "OriginalWord", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "SuggestedWords", name: "SuggestedWords", embedded: false, exported: true, typ: sliceType$1, tag: ""}, {prop: "HighlightSelectedWordHandler", name: "HighlightSelectedWordHandler", embedded: false, exported: true, typ: sliceType$2, tag: ""}, {prop: "UpdateSuggestMenuHandler", name: "UpdateSuggestMenuHandler", embedded: false, exported: true, typ: sliceType$2, tag: ""}, {prop: "HideSuggestMenuHandler", name: "HideSuggestMenuHandler", embedded: false, exported: true, typ: sliceType$3, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = godom.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = strconv.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = strings.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		state = ptrType.nil;
		css = "\n.suggest {\n  border-top-color: #C9D7F1;\n  border-right-color: #36C;\n  border-bottom-color: #36C;\n  border-left-color: #A2BAE7;\n  border-style: solid;\n  border-width: 1px;\n  z-index: 10;\n  padding: 0;\n  background-color: white;\n  overflow: hidden;\n  // - it seems that it does not matter relative position is set or not.\n  // seems no need to set position if there is no word preview.\n  // - if absolute is set, the width of suggest menu will be \"narrow\". just fit\n  // the width of longest words\n  // - set position to absolute if there is word preview next to suggest menu\n  position: relative;\n  left: 0;\n  text-align: left;\n  font-size: large;\n  border-radius: 4px;\n  margin-top: 1px;\n  line-height: 1.25em;\n}\n.wordSelected {\n  background: #00C;\n  color: white;\n  cursor: pointer;\n}\n.invisible-used-in-suggest {\n  display: none;\n}";
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["github.com/gopherjs/gopherjs/nosync"] = (function() {
	var $pkg = {}, $init, Mutex, Once, ptrType$1, funcType$1, ptrType$4;
	Mutex = $pkg.Mutex = $newType(0, $kindStruct, "nosync.Mutex", true, "github.com/gopherjs/gopherjs/nosync", true, function(locked_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.locked = false;
			return;
		}
		this.locked = locked_;
	});
	Once = $pkg.Once = $newType(0, $kindStruct, "nosync.Once", true, "github.com/gopherjs/gopherjs/nosync", true, function(doing_, done_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.doing = false;
			this.done = false;
			return;
		}
		this.doing = doing_;
		this.done = done_;
	});
	ptrType$1 = $ptrType(Mutex);
	funcType$1 = $funcType([], [], false);
	ptrType$4 = $ptrType(Once);
	Mutex.ptr.prototype.Lock = function() {
		var m;
		m = this;
		if (m.locked) {
			$panic(new $String("nosync: mutex is already locked"));
		}
		m.locked = true;
	};
	Mutex.prototype.Lock = function() { return this.$val.Lock(); };
	Mutex.ptr.prototype.Unlock = function() {
		var m;
		m = this;
		if (!m.locked) {
			$panic(new $String("nosync: unlock of unlocked mutex"));
		}
		m.locked = false;
	};
	Mutex.prototype.Unlock = function() { return this.$val.Unlock(); };
	Once.ptr.prototype.Do = function(f) {
		var f, o, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; f = $f.f; o = $f.o; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		o = [o];
		o[0] = this;
		if (o[0].done) {
			$s = -1; return;
		}
		if (o[0].doing) {
			$panic(new $String("nosync: Do called within f"));
		}
		o[0].doing = true;
		$deferred.push([(function(o) { return function() {
			o[0].doing = false;
			o[0].done = true;
		}; })(o), []]);
		$r = f(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$s = -1; return;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: Once.ptr.prototype.Do }; } $f.f = f; $f.o = o; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	Once.prototype.Do = function(f) { return this.$val.Do(f); };
	ptrType$1.methods = [{prop: "Lock", name: "Lock", pkg: "", typ: $funcType([], [], false)}, {prop: "Unlock", name: "Unlock", pkg: "", typ: $funcType([], [], false)}];
	ptrType$4.methods = [{prop: "Do", name: "Do", pkg: "", typ: $funcType([funcType$1], [], false)}];
	Mutex.init("github.com/gopherjs/gopherjs/nosync", [{prop: "locked", name: "locked", embedded: false, exported: false, typ: $Bool, tag: ""}]);
	Once.init("github.com/gopherjs/gopherjs/nosync", [{prop: "doing", name: "doing", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "done", name: "done", embedded: false, exported: false, typ: $Bool, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["math/rand"] = (function() {
	var $pkg = {}, $init, nosync, math, Source, Source64, Rand, lockedSource, rngSource, arrayType, ptrType, ptrType$1, sliceType, ptrType$2, ptrType$3, funcType, sliceType$1, ptrType$5, ke, we, fe, kn, wn, fn, globalRand, rngCooked, absInt32, NewSource, New, read, seedrand;
	nosync = $packages["github.com/gopherjs/gopherjs/nosync"];
	math = $packages["math"];
	Source = $pkg.Source = $newType(8, $kindInterface, "rand.Source", true, "math/rand", true, null);
	Source64 = $pkg.Source64 = $newType(8, $kindInterface, "rand.Source64", true, "math/rand", true, null);
	Rand = $pkg.Rand = $newType(0, $kindStruct, "rand.Rand", true, "math/rand", true, function(src_, s64_, readVal_, readPos_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.src = $ifaceNil;
			this.s64 = $ifaceNil;
			this.readVal = new $Int64(0, 0);
			this.readPos = 0;
			return;
		}
		this.src = src_;
		this.s64 = s64_;
		this.readVal = readVal_;
		this.readPos = readPos_;
	});
	lockedSource = $pkg.lockedSource = $newType(0, $kindStruct, "rand.lockedSource", true, "math/rand", false, function(lk_, src_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.lk = new nosync.Mutex.ptr(false);
			this.src = $ifaceNil;
			return;
		}
		this.lk = lk_;
		this.src = src_;
	});
	rngSource = $pkg.rngSource = $newType(0, $kindStruct, "rand.rngSource", true, "math/rand", false, function(tap_, feed_, vec_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.tap = 0;
			this.feed = 0;
			this.vec = arrayType.zero();
			return;
		}
		this.tap = tap_;
		this.feed = feed_;
		this.vec = vec_;
	});
	arrayType = $arrayType($Int64, 607);
	ptrType = $ptrType(lockedSource);
	ptrType$1 = $ptrType($Int8);
	sliceType = $sliceType($Int);
	ptrType$2 = $ptrType($Int64);
	ptrType$3 = $ptrType(Rand);
	funcType = $funcType([$Int, $Int], [], false);
	sliceType$1 = $sliceType($Uint8);
	ptrType$5 = $ptrType(rngSource);
	Rand.ptr.prototype.ExpFloat64 = function() {
		var _r, _r$1, _r$2, _r$3, i, j, r, x, x$1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; i = $f.i; j = $f.j; r = $f.r; x = $f.x; x$1 = $f.x$1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		r = this;
		/* while (true) { */ case 1:
			_r = r.Uint32(); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			j = _r;
			i = (j & 255) >>> 0;
			x = (j) * (((i < 0 || i >= we.length) ? ($throwRuntimeError("index out of range"), undefined) : we[i]));
			if (j < ((i < 0 || i >= ke.length) ? ($throwRuntimeError("index out of range"), undefined) : ke[i])) {
				$s = -1; return x;
			}
			/* */ if (i === 0) { $s = 4; continue; }
			/* */ $s = 5; continue;
			/* if (i === 0) { */ case 4:
				_r$1 = r.Float64(); /* */ $s = 6; case 6: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				_r$2 = math.Log(_r$1); /* */ $s = 7; case 7: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
				$s = -1; return 7.69711747013105 - _r$2;
			/* } */ case 5:
			_r$3 = r.Float64(); /* */ $s = 10; case 10: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
			/* */ if ($fround(((i < 0 || i >= fe.length) ? ($throwRuntimeError("index out of range"), undefined) : fe[i]) + $fround(($fround(_r$3)) * ($fround((x$1 = i - 1 >>> 0, ((x$1 < 0 || x$1 >= fe.length) ? ($throwRuntimeError("index out of range"), undefined) : fe[x$1])) - ((i < 0 || i >= fe.length) ? ($throwRuntimeError("index out of range"), undefined) : fe[i]))))) < ($fround(math.Exp(-x)))) { $s = 8; continue; }
			/* */ $s = 9; continue;
			/* if ($fround(((i < 0 || i >= fe.length) ? ($throwRuntimeError("index out of range"), undefined) : fe[i]) + $fround(($fround(_r$3)) * ($fround((x$1 = i - 1 >>> 0, ((x$1 < 0 || x$1 >= fe.length) ? ($throwRuntimeError("index out of range"), undefined) : fe[x$1])) - ((i < 0 || i >= fe.length) ? ($throwRuntimeError("index out of range"), undefined) : fe[i]))))) < ($fround(math.Exp(-x)))) { */ case 8:
				$s = -1; return x;
			/* } */ case 9:
		/* } */ $s = 1; continue; case 2:
		$s = -1; return 0;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Rand.ptr.prototype.ExpFloat64 }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f.i = i; $f.j = j; $f.r = r; $f.x = x; $f.x$1 = x$1; $f.$s = $s; $f.$r = $r; return $f;
	};
	Rand.prototype.ExpFloat64 = function() { return this.$val.ExpFloat64(); };
	absInt32 = function(i) {
		var i;
		if (i < 0) {
			return ((-i >>> 0));
		}
		return ((i >>> 0));
	};
	Rand.ptr.prototype.NormFloat64 = function() {
		var _r, _r$1, _r$2, _r$3, _r$4, _r$5, i, j, r, x, x$1, y, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _r$5 = $f._r$5; i = $f.i; j = $f.j; r = $f.r; x = $f.x; x$1 = $f.x$1; y = $f.y; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		r = this;
		/* while (true) { */ case 1:
			_r = r.Uint32(); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			j = ((_r >> 0));
			i = j & 127;
			x = (j) * (((i < 0 || i >= wn.length) ? ($throwRuntimeError("index out of range"), undefined) : wn[i]));
			if (absInt32(j) < ((i < 0 || i >= kn.length) ? ($throwRuntimeError("index out of range"), undefined) : kn[i])) {
				$s = -1; return x;
			}
			/* */ if (i === 0) { $s = 4; continue; }
			/* */ $s = 5; continue;
			/* if (i === 0) { */ case 4:
				/* while (true) { */ case 6:
					_r$1 = r.Float64(); /* */ $s = 8; case 8: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
					_r$2 = math.Log(_r$1); /* */ $s = 9; case 9: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
					x = -_r$2 * 0.29047645161474317;
					_r$3 = r.Float64(); /* */ $s = 10; case 10: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
					_r$4 = math.Log(_r$3); /* */ $s = 11; case 11: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
					y = -_r$4;
					if (y + y >= x * x) {
						/* break; */ $s = 7; continue;
					}
				/* } */ $s = 6; continue; case 7:
				if (j > 0) {
					$s = -1; return 3.442619855899 + x;
				}
				$s = -1; return -3.442619855899 - x;
			/* } */ case 5:
			_r$5 = r.Float64(); /* */ $s = 14; case 14: if($c) { $c = false; _r$5 = _r$5.$blk(); } if (_r$5 && _r$5.$blk !== undefined) { break s; }
			/* */ if ($fround(((i < 0 || i >= fn.length) ? ($throwRuntimeError("index out of range"), undefined) : fn[i]) + $fround(($fround(_r$5)) * ($fround((x$1 = i - 1 >> 0, ((x$1 < 0 || x$1 >= fn.length) ? ($throwRuntimeError("index out of range"), undefined) : fn[x$1])) - ((i < 0 || i >= fn.length) ? ($throwRuntimeError("index out of range"), undefined) : fn[i]))))) < ($fround(math.Exp(-0.5 * x * x)))) { $s = 12; continue; }
			/* */ $s = 13; continue;
			/* if ($fround(((i < 0 || i >= fn.length) ? ($throwRuntimeError("index out of range"), undefined) : fn[i]) + $fround(($fround(_r$5)) * ($fround((x$1 = i - 1 >> 0, ((x$1 < 0 || x$1 >= fn.length) ? ($throwRuntimeError("index out of range"), undefined) : fn[x$1])) - ((i < 0 || i >= fn.length) ? ($throwRuntimeError("index out of range"), undefined) : fn[i]))))) < ($fround(math.Exp(-0.5 * x * x)))) { */ case 12:
				$s = -1; return x;
			/* } */ case 13:
		/* } */ $s = 1; continue; case 2:
		$s = -1; return 0;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Rand.ptr.prototype.NormFloat64 }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._r$5 = _r$5; $f.i = i; $f.j = j; $f.r = r; $f.x = x; $f.x$1 = x$1; $f.y = y; $f.$s = $s; $f.$r = $r; return $f;
	};
	Rand.prototype.NormFloat64 = function() { return this.$val.NormFloat64(); };
	NewSource = function(seed) {
		var rng, seed;
		rng = new rngSource.ptr(0, 0, arrayType.zero());
		rng.Seed(seed);
		return rng;
	};
	$pkg.NewSource = NewSource;
	New = function(src) {
		var _tuple, s64, src;
		_tuple = $assertType(src, Source64, true);
		s64 = _tuple[0];
		return new Rand.ptr(src, s64, new $Int64(0, 0), 0);
	};
	$pkg.New = New;
	Rand.ptr.prototype.Seed = function(seed) {
		var _tuple, lk, ok, r, seed, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _tuple = $f._tuple; lk = $f.lk; ok = $f.ok; r = $f.r; seed = $f.seed; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		r = this;
		_tuple = $assertType(r.src, ptrType, true);
		lk = _tuple[0];
		ok = _tuple[1];
		/* */ if (ok) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (ok) { */ case 1:
			$r = lk.seedPos(seed, (r.$ptr_readPos || (r.$ptr_readPos = new ptrType$1(function() { return this.$target.readPos; }, function($v) { this.$target.readPos = $v; }, r)))); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			$s = -1; return;
		/* } */ case 2:
		$r = r.src.Seed(seed); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		r.readPos = 0;
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Rand.ptr.prototype.Seed }; } $f._tuple = _tuple; $f.lk = lk; $f.ok = ok; $f.r = r; $f.seed = seed; $f.$s = $s; $f.$r = $r; return $f;
	};
	Rand.prototype.Seed = function(seed) { return this.$val.Seed(seed); };
	Rand.ptr.prototype.Int63 = function() {
		var _r, r, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; r = $f.r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		r = this;
		_r = r.src.Int63(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Rand.ptr.prototype.Int63 }; } $f._r = _r; $f.r = r; $f.$s = $s; $f.$r = $r; return $f;
	};
	Rand.prototype.Int63 = function() { return this.$val.Int63(); };
	Rand.ptr.prototype.Uint32 = function() {
		var _r, r, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; r = $f.r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		r = this;
		_r = r.Int63(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return (($shiftRightInt64(_r, 31).$low >>> 0));
		/* */ } return; } if ($f === undefined) { $f = { $blk: Rand.ptr.prototype.Uint32 }; } $f._r = _r; $f.r = r; $f.$s = $s; $f.$r = $r; return $f;
	};
	Rand.prototype.Uint32 = function() { return this.$val.Uint32(); };
	Rand.ptr.prototype.Uint64 = function() {
		var _r, _r$1, _r$2, r, x, x$1, x$2, x$3, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; r = $f.r; x = $f.x; x$1 = $f.x$1; x$2 = $f.x$2; x$3 = $f.x$3; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		r = this;
		/* */ if (!($interfaceIsEqual(r.s64, $ifaceNil))) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!($interfaceIsEqual(r.s64, $ifaceNil))) { */ case 1:
			_r = r.s64.Uint64(); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			$s = -1; return _r;
		/* } */ case 2:
		_r$1 = r.Int63(); /* */ $s = 4; case 4: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_r$2 = r.Int63(); /* */ $s = 5; case 5: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		$s = -1; return (x = $shiftRightUint64(((x$1 = _r$1, new $Uint64(x$1.$high, x$1.$low))), 31), x$2 = $shiftLeft64(((x$3 = _r$2, new $Uint64(x$3.$high, x$3.$low))), 32), new $Uint64(x.$high | x$2.$high, (x.$low | x$2.$low) >>> 0));
		/* */ } return; } if ($f === undefined) { $f = { $blk: Rand.ptr.prototype.Uint64 }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f.r = r; $f.x = x; $f.x$1 = x$1; $f.x$2 = x$2; $f.x$3 = x$3; $f.$s = $s; $f.$r = $r; return $f;
	};
	Rand.prototype.Uint64 = function() { return this.$val.Uint64(); };
	Rand.ptr.prototype.Int31 = function() {
		var _r, r, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; r = $f.r; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		r = this;
		_r = r.Int63(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return (((x = $shiftRightInt64(_r, 32), x.$low + ((x.$high >> 31) * 4294967296)) >> 0));
		/* */ } return; } if ($f === undefined) { $f = { $blk: Rand.ptr.prototype.Int31 }; } $f._r = _r; $f.r = r; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	Rand.prototype.Int31 = function() { return this.$val.Int31(); };
	Rand.ptr.prototype.Int = function() {
		var _r, r, u, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; r = $f.r; u = $f.u; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		r = this;
		_r = r.Int63(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		u = ((_r.$low >>> 0));
		$s = -1; return ((((u << 1 >>> 0) >>> 1 >>> 0) >> 0));
		/* */ } return; } if ($f === undefined) { $f = { $blk: Rand.ptr.prototype.Int }; } $f._r = _r; $f.r = r; $f.u = u; $f.$s = $s; $f.$r = $r; return $f;
	};
	Rand.prototype.Int = function() { return this.$val.Int(); };
	Rand.ptr.prototype.Int63n = function(n) {
		var _r, _r$1, _r$2, max, n, r, v, x, x$1, x$2, x$3, x$4, x$5, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; max = $f.max; n = $f.n; r = $f.r; v = $f.v; x = $f.x; x$1 = $f.x$1; x$2 = $f.x$2; x$3 = $f.x$3; x$4 = $f.x$4; x$5 = $f.x$5; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		r = this;
		if ((n.$high < 0 || (n.$high === 0 && n.$low <= 0))) {
			$panic(new $String("invalid argument to Int63n"));
		}
		/* */ if ((x = (x$1 = new $Int64(n.$high - 0, n.$low - 1), new $Int64(n.$high & x$1.$high, (n.$low & x$1.$low) >>> 0)), (x.$high === 0 && x.$low === 0))) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if ((x = (x$1 = new $Int64(n.$high - 0, n.$low - 1), new $Int64(n.$high & x$1.$high, (n.$low & x$1.$low) >>> 0)), (x.$high === 0 && x.$low === 0))) { */ case 1:
			_r = r.Int63(); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			$s = -1; return (x$2 = _r, x$3 = new $Int64(n.$high - 0, n.$low - 1), new $Int64(x$2.$high & x$3.$high, (x$2.$low & x$3.$low) >>> 0));
		/* } */ case 2:
		max = ((x$4 = (x$5 = $div64(new $Uint64(2147483648, 0), (new $Uint64(n.$high, n.$low)), true), new $Uint64(2147483647 - x$5.$high, 4294967295 - x$5.$low)), new $Int64(x$4.$high, x$4.$low)));
		_r$1 = r.Int63(); /* */ $s = 4; case 4: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		v = _r$1;
		/* while (true) { */ case 5:
			/* if (!((v.$high > max.$high || (v.$high === max.$high && v.$low > max.$low)))) { break; } */ if(!((v.$high > max.$high || (v.$high === max.$high && v.$low > max.$low)))) { $s = 6; continue; }
			_r$2 = r.Int63(); /* */ $s = 7; case 7: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
			v = _r$2;
		/* } */ $s = 5; continue; case 6:
		$s = -1; return $div64(v, n, true);
		/* */ } return; } if ($f === undefined) { $f = { $blk: Rand.ptr.prototype.Int63n }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f.max = max; $f.n = n; $f.r = r; $f.v = v; $f.x = x; $f.x$1 = x$1; $f.x$2 = x$2; $f.x$3 = x$3; $f.x$4 = x$4; $f.x$5 = x$5; $f.$s = $s; $f.$r = $r; return $f;
	};
	Rand.prototype.Int63n = function(n) { return this.$val.Int63n(n); };
	Rand.ptr.prototype.Int31n = function(n) {
		var _r, _r$1, _r$2, _r$3, _r$4, max, n, r, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; max = $f.max; n = $f.n; r = $f.r; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		r = this;
		if (n <= 0) {
			$panic(new $String("invalid argument to Int31n"));
		}
		/* */ if ((n & ((n - 1 >> 0))) === 0) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if ((n & ((n - 1 >> 0))) === 0) { */ case 1:
			_r = r.Int31(); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			$s = -1; return _r & ((n - 1 >> 0));
		/* } */ case 2:
		max = (((2147483647 - (_r$1 = 2147483648 % ((n >>> 0)), _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) >>> 0) >> 0));
		_r$2 = r.Int31(); /* */ $s = 4; case 4: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		v = _r$2;
		/* while (true) { */ case 5:
			/* if (!(v > max)) { break; } */ if(!(v > max)) { $s = 6; continue; }
			_r$3 = r.Int31(); /* */ $s = 7; case 7: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
			v = _r$3;
		/* } */ $s = 5; continue; case 6:
		$s = -1; return (_r$4 = v % n, _r$4 === _r$4 ? _r$4 : $throwRuntimeError("integer divide by zero"));
		/* */ } return; } if ($f === undefined) { $f = { $blk: Rand.ptr.prototype.Int31n }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f.max = max; $f.n = n; $f.r = r; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Rand.prototype.Int31n = function(n) { return this.$val.Int31n(n); };
	Rand.ptr.prototype.int31n = function(n) {
		var _r, _r$1, _r$2, low, n, prod, r, thresh, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; low = $f.low; n = $f.n; prod = $f.prod; r = $f.r; thresh = $f.thresh; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		r = this;
		_r = r.Uint32(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		v = _r;
		prod = $mul64((new $Uint64(0, v)), (new $Uint64(0, n)));
		low = ((prod.$low >>> 0));
		/* */ if (low < ((n >>> 0))) { $s = 2; continue; }
		/* */ $s = 3; continue;
		/* if (low < ((n >>> 0))) { */ case 2:
			thresh = (_r$1 = ((-n >>> 0)) % ((n >>> 0)), _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero"));
			/* while (true) { */ case 4:
				/* if (!(low < thresh)) { break; } */ if(!(low < thresh)) { $s = 5; continue; }
				_r$2 = r.Uint32(); /* */ $s = 6; case 6: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
				v = _r$2;
				prod = $mul64((new $Uint64(0, v)), (new $Uint64(0, n)));
				low = ((prod.$low >>> 0));
			/* } */ $s = 4; continue; case 5:
		/* } */ case 3:
		$s = -1; return (($shiftRightUint64(prod, 32).$low >> 0));
		/* */ } return; } if ($f === undefined) { $f = { $blk: Rand.ptr.prototype.int31n }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f.low = low; $f.n = n; $f.prod = prod; $f.r = r; $f.thresh = thresh; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Rand.prototype.int31n = function(n) { return this.$val.int31n(n); };
	Rand.ptr.prototype.Intn = function(n) {
		var _r, _r$1, n, r, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; n = $f.n; r = $f.r; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		r = this;
		if (n <= 0) {
			$panic(new $String("invalid argument to Intn"));
		}
		/* */ if (n <= 2147483647) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (n <= 2147483647) { */ case 1:
			_r = r.Int31n(((n >> 0))); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			$s = -1; return ((_r >> 0));
		/* } */ case 2:
		_r$1 = r.Int63n((new $Int64(0, n))); /* */ $s = 4; case 4: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		$s = -1; return (((x = _r$1, x.$low + ((x.$high >> 31) * 4294967296)) >> 0));
		/* */ } return; } if ($f === undefined) { $f = { $blk: Rand.ptr.prototype.Intn }; } $f._r = _r; $f._r$1 = _r$1; $f.n = n; $f.r = r; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	Rand.prototype.Intn = function(n) { return this.$val.Intn(n); };
	Rand.ptr.prototype.Float64 = function() {
		var _r, f, r, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; f = $f.f; r = $f.r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		r = this;
		/* again: */ case 1:
		_r = r.Int63(); /* */ $s = 2; case 2: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		f = ($flatten64(_r)) / 9.223372036854776e+18;
		/* */ if (f === 1) { $s = 3; continue; }
		/* */ $s = 4; continue;
		/* if (f === 1) { */ case 3:
			/* goto again */ $s = 1; continue;
		/* } */ case 4:
		$s = -1; return f;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Rand.ptr.prototype.Float64 }; } $f._r = _r; $f.f = f; $f.r = r; $f.$s = $s; $f.$r = $r; return $f;
	};
	Rand.prototype.Float64 = function() { return this.$val.Float64(); };
	Rand.ptr.prototype.Float32 = function() {
		var _r, f, r, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; f = $f.f; r = $f.r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		r = this;
		/* again: */ case 1:
		_r = r.Float64(); /* */ $s = 2; case 2: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		f = ($fround(_r));
		/* */ if (f === 1) { $s = 3; continue; }
		/* */ $s = 4; continue;
		/* if (f === 1) { */ case 3:
			/* goto again */ $s = 1; continue;
		/* } */ case 4:
		$s = -1; return f;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Rand.ptr.prototype.Float32 }; } $f._r = _r; $f.f = f; $f.r = r; $f.$s = $s; $f.$r = $r; return $f;
	};
	Rand.prototype.Float32 = function() { return this.$val.Float32(); };
	Rand.ptr.prototype.Perm = function(n) {
		var _r, i, j, m, n, r, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; i = $f.i; j = $f.j; m = $f.m; n = $f.n; r = $f.r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		r = this;
		m = $makeSlice(sliceType, n);
		i = 0;
		/* while (true) { */ case 1:
			/* if (!(i < n)) { break; } */ if(!(i < n)) { $s = 2; continue; }
			_r = r.Intn(i + 1 >> 0); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			j = _r;
			((i < 0 || i >= m.$length) ? ($throwRuntimeError("index out of range"), undefined) : m.$array[m.$offset + i] = ((j < 0 || j >= m.$length) ? ($throwRuntimeError("index out of range"), undefined) : m.$array[m.$offset + j]));
			((j < 0 || j >= m.$length) ? ($throwRuntimeError("index out of range"), undefined) : m.$array[m.$offset + j] = i);
			i = i + (1) >> 0;
		/* } */ $s = 1; continue; case 2:
		$s = -1; return m;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Rand.ptr.prototype.Perm }; } $f._r = _r; $f.i = i; $f.j = j; $f.m = m; $f.n = n; $f.r = r; $f.$s = $s; $f.$r = $r; return $f;
	};
	Rand.prototype.Perm = function(n) { return this.$val.Perm(n); };
	Rand.ptr.prototype.Shuffle = function(n, swap) {
		var _r, _r$1, i, j, j$1, n, r, swap, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; i = $f.i; j = $f.j; j$1 = $f.j$1; n = $f.n; r = $f.r; swap = $f.swap; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		r = this;
		if (n < 0) {
			$panic(new $String("invalid argument to Shuffle"));
		}
		i = n - 1 >> 0;
		/* while (true) { */ case 1:
			/* if (!(i > 2147483646)) { break; } */ if(!(i > 2147483646)) { $s = 2; continue; }
			_r = r.Int63n((new $Int64(0, (i + 1 >> 0)))); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			j = (((x = _r, x.$low + ((x.$high >> 31) * 4294967296)) >> 0));
			$r = swap(i, j); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			i = i - (1) >> 0;
		/* } */ $s = 1; continue; case 2:
		/* while (true) { */ case 5:
			/* if (!(i > 0)) { break; } */ if(!(i > 0)) { $s = 6; continue; }
			_r$1 = r.int31n((((i + 1 >> 0) >> 0))); /* */ $s = 7; case 7: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			j$1 = ((_r$1 >> 0));
			$r = swap(i, j$1); /* */ $s = 8; case 8: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			i = i - (1) >> 0;
		/* } */ $s = 5; continue; case 6:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Rand.ptr.prototype.Shuffle }; } $f._r = _r; $f._r$1 = _r$1; $f.i = i; $f.j = j; $f.j$1 = j$1; $f.n = n; $f.r = r; $f.swap = swap; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	Rand.prototype.Shuffle = function(n, swap) { return this.$val.Shuffle(n, swap); };
	Rand.ptr.prototype.Read = function(p) {
		var _r, _r$1, _tuple, _tuple$1, _tuple$2, err, lk, n, ok, p, r, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _tuple = $f._tuple; _tuple$1 = $f._tuple$1; _tuple$2 = $f._tuple$2; err = $f.err; lk = $f.lk; n = $f.n; ok = $f.ok; p = $f.p; r = $f.r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		n = 0;
		err = $ifaceNil;
		r = this;
		_tuple = $assertType(r.src, ptrType, true);
		lk = _tuple[0];
		ok = _tuple[1];
		/* */ if (ok) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (ok) { */ case 1:
			_r = lk.read(p, (r.$ptr_readVal || (r.$ptr_readVal = new ptrType$2(function() { return this.$target.readVal; }, function($v) { this.$target.readVal = $v; }, r))), (r.$ptr_readPos || (r.$ptr_readPos = new ptrType$1(function() { return this.$target.readPos; }, function($v) { this.$target.readPos = $v; }, r)))); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_tuple$1 = _r;
			n = _tuple$1[0];
			err = _tuple$1[1];
			$s = -1; return [n, err];
		/* } */ case 2:
		_r$1 = read(p, $methodVal(r, "Int63"), (r.$ptr_readVal || (r.$ptr_readVal = new ptrType$2(function() { return this.$target.readVal; }, function($v) { this.$target.readVal = $v; }, r))), (r.$ptr_readPos || (r.$ptr_readPos = new ptrType$1(function() { return this.$target.readPos; }, function($v) { this.$target.readPos = $v; }, r)))); /* */ $s = 4; case 4: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_tuple$2 = _r$1;
		n = _tuple$2[0];
		err = _tuple$2[1];
		$s = -1; return [n, err];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Rand.ptr.prototype.Read }; } $f._r = _r; $f._r$1 = _r$1; $f._tuple = _tuple; $f._tuple$1 = _tuple$1; $f._tuple$2 = _tuple$2; $f.err = err; $f.lk = lk; $f.n = n; $f.ok = ok; $f.p = p; $f.r = r; $f.$s = $s; $f.$r = $r; return $f;
	};
	Rand.prototype.Read = function(p) { return this.$val.Read(p); };
	read = function(p, int63, readVal, readPos) {
		var _r, err, int63, n, p, pos, readPos, readVal, val, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; err = $f.err; int63 = $f.int63; n = $f.n; p = $f.p; pos = $f.pos; readPos = $f.readPos; readVal = $f.readVal; val = $f.val; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		n = 0;
		err = $ifaceNil;
		pos = readPos.$get();
		val = readVal.$get();
		n = 0;
		/* while (true) { */ case 1:
			/* if (!(n < p.$length)) { break; } */ if(!(n < p.$length)) { $s = 2; continue; }
			/* */ if (pos === 0) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (pos === 0) { */ case 3:
				_r = int63(); /* */ $s = 5; case 5: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				val = _r;
				pos = 7;
			/* } */ case 4:
			((n < 0 || n >= p.$length) ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + n] = ((val.$low << 24 >>> 24)));
			val = $shiftRightInt64(val, (8));
			pos = pos - (1) << 24 >> 24;
			n = n + (1) >> 0;
		/* } */ $s = 1; continue; case 2:
		readPos.$set(pos);
		readVal.$set(val);
		$s = -1; return [n, err];
		/* */ } return; } if ($f === undefined) { $f = { $blk: read }; } $f._r = _r; $f.err = err; $f.int63 = int63; $f.n = n; $f.p = p; $f.pos = pos; $f.readPos = readPos; $f.readVal = readVal; $f.val = val; $f.$s = $s; $f.$r = $r; return $f;
	};
	lockedSource.ptr.prototype.Int63 = function() {
		var _r, n, r, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; n = $f.n; r = $f.r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		n = new $Int64(0, 0);
		r = this;
		r.lk.Lock();
		_r = r.src.Int63(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		n = _r;
		r.lk.Unlock();
		$s = -1; return n;
		/* */ } return; } if ($f === undefined) { $f = { $blk: lockedSource.ptr.prototype.Int63 }; } $f._r = _r; $f.n = n; $f.r = r; $f.$s = $s; $f.$r = $r; return $f;
	};
	lockedSource.prototype.Int63 = function() { return this.$val.Int63(); };
	lockedSource.ptr.prototype.Uint64 = function() {
		var _r, n, r, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; n = $f.n; r = $f.r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		n = new $Uint64(0, 0);
		r = this;
		r.lk.Lock();
		_r = r.src.Uint64(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		n = _r;
		r.lk.Unlock();
		$s = -1; return n;
		/* */ } return; } if ($f === undefined) { $f = { $blk: lockedSource.ptr.prototype.Uint64 }; } $f._r = _r; $f.n = n; $f.r = r; $f.$s = $s; $f.$r = $r; return $f;
	};
	lockedSource.prototype.Uint64 = function() { return this.$val.Uint64(); };
	lockedSource.ptr.prototype.Seed = function(seed) {
		var r, seed, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; r = $f.r; seed = $f.seed; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		r = this;
		r.lk.Lock();
		$r = r.src.Seed(seed); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		r.lk.Unlock();
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: lockedSource.ptr.prototype.Seed }; } $f.r = r; $f.seed = seed; $f.$s = $s; $f.$r = $r; return $f;
	};
	lockedSource.prototype.Seed = function(seed) { return this.$val.Seed(seed); };
	lockedSource.ptr.prototype.seedPos = function(seed, readPos) {
		var r, readPos, seed, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; r = $f.r; readPos = $f.readPos; seed = $f.seed; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		r = this;
		r.lk.Lock();
		$r = r.src.Seed(seed); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		readPos.$set(0);
		r.lk.Unlock();
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: lockedSource.ptr.prototype.seedPos }; } $f.r = r; $f.readPos = readPos; $f.seed = seed; $f.$s = $s; $f.$r = $r; return $f;
	};
	lockedSource.prototype.seedPos = function(seed, readPos) { return this.$val.seedPos(seed, readPos); };
	lockedSource.ptr.prototype.read = function(p, readVal, readPos) {
		var _r, _tuple, err, n, p, r, readPos, readVal, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; err = $f.err; n = $f.n; p = $f.p; r = $f.r; readPos = $f.readPos; readVal = $f.readVal; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		n = 0;
		err = $ifaceNil;
		r = this;
		r.lk.Lock();
		_r = read(p, $methodVal(r.src, "Int63"), readVal, readPos); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		n = _tuple[0];
		err = _tuple[1];
		r.lk.Unlock();
		$s = -1; return [n, err];
		/* */ } return; } if ($f === undefined) { $f = { $blk: lockedSource.ptr.prototype.read }; } $f._r = _r; $f._tuple = _tuple; $f.err = err; $f.n = n; $f.p = p; $f.r = r; $f.readPos = readPos; $f.readVal = readVal; $f.$s = $s; $f.$r = $r; return $f;
	};
	lockedSource.prototype.read = function(p, readVal, readPos) { return this.$val.read(p, readVal, readPos); };
	seedrand = function(x) {
		var _q, _r, hi, lo, x;
		hi = (_q = x / 44488, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		lo = (_r = x % 44488, _r === _r ? _r : $throwRuntimeError("integer divide by zero"));
		x = ($imul(48271, lo)) - ($imul(3399, hi)) >> 0;
		if (x < 0) {
			x = x + (2147483647) >> 0;
		}
		return x;
	};
	rngSource.ptr.prototype.Seed = function(seed) {
		var i, rng, seed, u, x, x$1, x$2, x$3, x$4, x$5;
		rng = this;
		rng.tap = 0;
		rng.feed = 334;
		seed = $div64(seed, new $Int64(0, 2147483647), true);
		if ((seed.$high < 0 || (seed.$high === 0 && seed.$low < 0))) {
			seed = (x = new $Int64(0, 2147483647), new $Int64(seed.$high + x.$high, seed.$low + x.$low));
		}
		if ((seed.$high === 0 && seed.$low === 0)) {
			seed = new $Int64(0, 89482311);
		}
		x$1 = (((seed.$low + ((seed.$high >> 31) * 4294967296)) >> 0));
		i = -20;
		while (true) {
			if (!(i < 607)) { break; }
			x$1 = seedrand(x$1);
			if (i >= 0) {
				u = new $Int64(0, 0);
				u = $shiftLeft64((new $Int64(0, x$1)), 40);
				x$1 = seedrand(x$1);
				u = (x$2 = $shiftLeft64((new $Int64(0, x$1)), 20), new $Int64(u.$high ^ x$2.$high, (u.$low ^ x$2.$low) >>> 0));
				x$1 = seedrand(x$1);
				u = (x$3 = (new $Int64(0, x$1)), new $Int64(u.$high ^ x$3.$high, (u.$low ^ x$3.$low) >>> 0));
				u = (x$4 = ((i < 0 || i >= rngCooked.length) ? ($throwRuntimeError("index out of range"), undefined) : rngCooked[i]), new $Int64(u.$high ^ x$4.$high, (u.$low ^ x$4.$low) >>> 0));
				(x$5 = rng.vec, ((i < 0 || i >= x$5.length) ? ($throwRuntimeError("index out of range"), undefined) : x$5[i] = u));
			}
			i = i + (1) >> 0;
		}
	};
	rngSource.prototype.Seed = function(seed) { return this.$val.Seed(seed); };
	rngSource.ptr.prototype.Int63 = function() {
		var rng, x, x$1;
		rng = this;
		return ((x = (x$1 = rng.Uint64(), new $Uint64(x$1.$high & 2147483647, (x$1.$low & 4294967295) >>> 0)), new $Int64(x.$high, x.$low)));
	};
	rngSource.prototype.Int63 = function() { return this.$val.Int63(); };
	rngSource.ptr.prototype.Uint64 = function() {
		var rng, x, x$1, x$2, x$3, x$4, x$5, x$6, x$7, x$8;
		rng = this;
		rng.tap = rng.tap - (1) >> 0;
		if (rng.tap < 0) {
			rng.tap = rng.tap + (607) >> 0;
		}
		rng.feed = rng.feed - (1) >> 0;
		if (rng.feed < 0) {
			rng.feed = rng.feed + (607) >> 0;
		}
		x$6 = (x = (x$1 = rng.vec, x$2 = rng.feed, ((x$2 < 0 || x$2 >= x$1.length) ? ($throwRuntimeError("index out of range"), undefined) : x$1[x$2])), x$3 = (x$4 = rng.vec, x$5 = rng.tap, ((x$5 < 0 || x$5 >= x$4.length) ? ($throwRuntimeError("index out of range"), undefined) : x$4[x$5])), new $Int64(x.$high + x$3.$high, x.$low + x$3.$low));
		(x$7 = rng.vec, x$8 = rng.feed, ((x$8 < 0 || x$8 >= x$7.length) ? ($throwRuntimeError("index out of range"), undefined) : x$7[x$8] = x$6));
		return (new $Uint64(x$6.$high, x$6.$low));
	};
	rngSource.prototype.Uint64 = function() { return this.$val.Uint64(); };
	ptrType$3.methods = [{prop: "ExpFloat64", name: "ExpFloat64", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "NormFloat64", name: "NormFloat64", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Seed", name: "Seed", pkg: "", typ: $funcType([$Int64], [], false)}, {prop: "Int63", name: "Int63", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "Uint32", name: "Uint32", pkg: "", typ: $funcType([], [$Uint32], false)}, {prop: "Uint64", name: "Uint64", pkg: "", typ: $funcType([], [$Uint64], false)}, {prop: "Int31", name: "Int31", pkg: "", typ: $funcType([], [$Int32], false)}, {prop: "Int", name: "Int", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Int63n", name: "Int63n", pkg: "", typ: $funcType([$Int64], [$Int64], false)}, {prop: "Int31n", name: "Int31n", pkg: "", typ: $funcType([$Int32], [$Int32], false)}, {prop: "int31n", name: "int31n", pkg: "math/rand", typ: $funcType([$Int32], [$Int32], false)}, {prop: "Intn", name: "Intn", pkg: "", typ: $funcType([$Int], [$Int], false)}, {prop: "Float64", name: "Float64", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Float32", name: "Float32", pkg: "", typ: $funcType([], [$Float32], false)}, {prop: "Perm", name: "Perm", pkg: "", typ: $funcType([$Int], [sliceType], false)}, {prop: "Shuffle", name: "Shuffle", pkg: "", typ: $funcType([$Int, funcType], [], false)}, {prop: "Read", name: "Read", pkg: "", typ: $funcType([sliceType$1], [$Int, $error], false)}];
	ptrType.methods = [{prop: "Int63", name: "Int63", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "Uint64", name: "Uint64", pkg: "", typ: $funcType([], [$Uint64], false)}, {prop: "Seed", name: "Seed", pkg: "", typ: $funcType([$Int64], [], false)}, {prop: "seedPos", name: "seedPos", pkg: "math/rand", typ: $funcType([$Int64, ptrType$1], [], false)}, {prop: "read", name: "read", pkg: "math/rand", typ: $funcType([sliceType$1, ptrType$2, ptrType$1], [$Int, $error], false)}];
	ptrType$5.methods = [{prop: "Seed", name: "Seed", pkg: "", typ: $funcType([$Int64], [], false)}, {prop: "Int63", name: "Int63", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "Uint64", name: "Uint64", pkg: "", typ: $funcType([], [$Uint64], false)}];
	Source.init([{prop: "Int63", name: "Int63", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "Seed", name: "Seed", pkg: "", typ: $funcType([$Int64], [], false)}]);
	Source64.init([{prop: "Int63", name: "Int63", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "Seed", name: "Seed", pkg: "", typ: $funcType([$Int64], [], false)}, {prop: "Uint64", name: "Uint64", pkg: "", typ: $funcType([], [$Uint64], false)}]);
	Rand.init("math/rand", [{prop: "src", name: "src", embedded: false, exported: false, typ: Source, tag: ""}, {prop: "s64", name: "s64", embedded: false, exported: false, typ: Source64, tag: ""}, {prop: "readVal", name: "readVal", embedded: false, exported: false, typ: $Int64, tag: ""}, {prop: "readPos", name: "readPos", embedded: false, exported: false, typ: $Int8, tag: ""}]);
	lockedSource.init("math/rand", [{prop: "lk", name: "lk", embedded: false, exported: false, typ: nosync.Mutex, tag: ""}, {prop: "src", name: "src", embedded: false, exported: false, typ: Source64, tag: ""}]);
	rngSource.init("math/rand", [{prop: "tap", name: "tap", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "feed", name: "feed", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "vec", name: "vec", embedded: false, exported: false, typ: arrayType, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = nosync.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = math.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		ke = $toNativeArray($kindUint32, [3801129273, 0, 2615860924, 3279400049, 3571300752, 3733536696, 3836274812, 3906990442, 3958562475, 3997804264, 4028649213, 4053523342, 4074002619, 4091154507, 4105727352, 4118261130, 4129155133, 4138710916, 4147160435, 4154685009, 4161428406, 4167506077, 4173011791, 4178022498, 4182601930, 4186803325, 4190671498, 4194244443, 4197554582, 4200629752, 4203493986, 4206168142, 4208670408, 4211016720, 4213221098, 4215295924, 4217252177, 4219099625, 4220846988, 4222502074, 4224071896, 4225562770, 4226980400, 4228329951, 4229616109, 4230843138, 4232014925, 4233135020, 4234206673, 4235232866, 4236216336, 4237159604, 4238064994, 4238934652, 4239770563, 4240574564, 4241348362, 4242093539, 4242811568, 4243503822, 4244171579, 4244816032, 4245438297, 4246039419, 4246620374, 4247182079, 4247725394, 4248251127, 4248760037, 4249252839, 4249730206, 4250192773, 4250641138, 4251075867, 4251497493, 4251906522, 4252303431, 4252688672, 4253062674, 4253425844, 4253778565, 4254121205, 4254454110, 4254777611, 4255092022, 4255397640, 4255694750, 4255983622, 4256264513, 4256537670, 4256803325, 4257061702, 4257313014, 4257557464, 4257795244, 4258026541, 4258251531, 4258470383, 4258683258, 4258890309, 4259091685, 4259287526, 4259477966, 4259663135, 4259843154, 4260018142, 4260188212, 4260353470, 4260514019, 4260669958, 4260821380, 4260968374, 4261111028, 4261249421, 4261383632, 4261513736, 4261639802, 4261761900, 4261880092, 4261994441, 4262105003, 4262211835, 4262314988, 4262414513, 4262510454, 4262602857, 4262691764, 4262777212, 4262859239, 4262937878, 4263013162, 4263085118, 4263153776, 4263219158, 4263281289, 4263340187, 4263395872, 4263448358, 4263497660, 4263543789, 4263586755, 4263626565, 4263663224, 4263696735, 4263727099, 4263754314, 4263778377, 4263799282, 4263817020, 4263831582, 4263842955, 4263851124, 4263856071, 4263857776, 4263856218, 4263851370, 4263843206, 4263831695, 4263816804, 4263798497, 4263776735, 4263751476, 4263722676, 4263690284, 4263654251, 4263614520, 4263571032, 4263523724, 4263472530, 4263417377, 4263358192, 4263294892, 4263227394, 4263155608, 4263079437, 4262998781, 4262913534, 4262823581, 4262728804, 4262629075, 4262524261, 4262414220, 4262298801, 4262177846, 4262051187, 4261918645, 4261780032, 4261635148, 4261483780, 4261325704, 4261160681, 4260988457, 4260808763, 4260621313, 4260425802, 4260221905, 4260009277, 4259787550, 4259556329, 4259315195, 4259063697, 4258801357, 4258527656, 4258242044, 4257943926, 4257632664, 4257307571, 4256967906, 4256612870, 4256241598, 4255853155, 4255446525, 4255020608, 4254574202, 4254106002, 4253614578, 4253098370, 4252555662, 4251984571, 4251383021, 4250748722, 4250079132, 4249371435, 4248622490, 4247828790, 4246986404, 4246090910, 4245137315, 4244119963, 4243032411, 4241867296, 4240616155, 4239269214, 4237815118, 4236240596, 4234530035, 4232664930, 4230623176, 4228378137, 4225897409, 4223141146, 4220059768, 4216590757, 4212654085, 4208145538, 4202926710, 4196809522, 4189531420, 4180713890, 4169789475, 4155865042, 4137444620, 4111806704, 4073393724, 4008685917, 3873074895]);
		we = $toNativeArray($kindFloat32, [2.0249555365836613e-09, 1.4866739783681027e-11, 2.4409616689036184e-11, 3.1968806074589295e-11, 3.844677007314168e-11, 4.42282044321729e-11, 4.951644302919611e-11, 5.443358958023836e-11, 5.905943789574764e-11, 6.34494193296753e-11, 6.764381416113352e-11, 7.167294535648239e-11, 7.556032188826833e-11, 7.932458162551725e-11, 8.298078890689453e-11, 8.654132271912474e-11, 9.001651507523079e-11, 9.341507428706208e-11, 9.674443190998971e-11, 1.0001099254308699e-10, 1.0322031424037093e-10, 1.0637725422757427e-10, 1.0948611461891744e-10, 1.1255067711157807e-10, 1.1557434870246297e-10, 1.1856014781042035e-10, 1.2151082917633005e-10, 1.2442885610752796e-10, 1.2731647680563896e-10, 1.3017574518325858e-10, 1.330085347417409e-10, 1.3581656632677408e-10, 1.386014220061682e-10, 1.413645728254309e-10, 1.4410737880776736e-10, 1.4683107507629245e-10, 1.4953686899854546e-10, 1.522258291641876e-10, 1.5489899640730442e-10, 1.575573282952547e-10, 1.6020171300645814e-10, 1.628330109637588e-10, 1.6545202707884954e-10, 1.68059510752272e-10, 1.7065616975120435e-10, 1.73242697965037e-10, 1.758197337720091e-10, 1.783878739169964e-10, 1.8094774290045024e-10, 1.834998542005195e-10, 1.8604476292871652e-10, 1.8858298256319017e-10, 1.9111498494872592e-10, 1.9364125580789704e-10, 1.9616222535212557e-10, 1.9867835154840918e-10, 2.011900368525943e-10, 2.0369768372052732e-10, 2.062016807302669e-10, 2.0870240258208383e-10, 2.1120022397624894e-10, 2.136955057352452e-10, 2.1618855317040442e-10, 2.1867974098199738e-10, 2.2116936060356807e-10, 2.2365774510202385e-10, 2.2614519978869652e-10, 2.2863201609713002e-10, 2.3111849933865614e-10, 2.3360494094681883e-10, 2.3609159072179864e-10, 2.3857874009713953e-10, 2.4106666662859766e-10, 2.4355562011635357e-10, 2.460458781161634e-10, 2.485376904282077e-10, 2.5103127909709144e-10, 2.5352694943414633e-10, 2.560248957284017e-10, 2.585253955356137e-10, 2.610286709003873e-10, 2.6353494386732734e-10, 2.6604446423661443e-10, 2.6855745405285347e-10, 2.71074163116225e-10, 2.7359478571575835e-10, 2.7611959940720965e-10, 2.786487707240326e-10, 2.8118254946640775e-10, 2.8372118543451563e-10, 2.8626484516180994e-10, 2.8881380620404684e-10, 2.9136826285025563e-10, 2.9392840938946563e-10, 2.96494523377433e-10, 2.990667713476114e-10, 3.016454031001814e-10, 3.042306406797479e-10, 3.068226783753403e-10, 3.09421765987139e-10, 3.12028125559749e-10, 3.1464195138219964e-10, 3.17263521010247e-10, 3.1989300097734485e-10, 3.225306410836737e-10, 3.2517669112941405e-10, 3.2783134540359526e-10, 3.3049485370639786e-10, 3.3316743808242677e-10, 3.3584937608743815e-10, 3.385408342548857e-10, 3.4124211789610115e-10, 3.4395342130011386e-10, 3.4667499426710435e-10, 3.494071143528288e-10, 3.521500313574677e-10, 3.54903967325626e-10, 3.576691720574843e-10, 3.6044595086437425e-10, 3.632345535464765e-10, 3.660352021483959e-10, 3.688482297370399e-10, 3.716738583570134e-10, 3.7451239331964814e-10, 3.773641121807003e-10, 3.802292924959261e-10, 3.831082673322328e-10, 3.8600128648980103e-10, 3.8890865527996255e-10, 3.9183070676962473e-10, 3.9476774627011935e-10, 3.977200790927782e-10, 4.006880383045086e-10, 4.0367195697221803e-10, 4.066721681628138e-10, 4.0968900494320337e-10, 4.127228558914453e-10, 4.15774054074447e-10, 4.188429603146915e-10, 4.2192993543466173e-10, 4.25035395767992e-10, 4.2815970213716525e-10, 4.313032986313914e-10, 4.3446651831757777e-10, 4.376498607960855e-10, 4.408536868893975e-10, 4.4407846844229937e-10, 4.4732464954400086e-10, 4.5059267428371186e-10, 4.538830145062178e-10, 4.5719619756745544e-10, 4.605326675566346e-10, 4.638929240741163e-10, 4.672775499869886e-10, 4.706869893844612e-10, 4.74121908400349e-10, 4.775827511238617e-10, 4.810701836888143e-10, 4.845848167178701e-10, 4.881271498113904e-10, 4.916979601254923e-10, 4.952977472605369e-10, 4.989272883726414e-10, 5.025872495956207e-10, 5.062783525744408e-10, 5.100013189540675e-10, 5.13756870379467e-10, 5.175458395179078e-10, 5.21369003525507e-10, 5.252272505806843e-10, 5.29121357839557e-10, 5.330522134805449e-10, 5.3702081670437e-10, 5.41028055689452e-10, 5.450749851476644e-10, 5.491624932574268e-10, 5.532918012640664e-10, 5.574638528571541e-10, 5.616799247931681e-10, 5.659410717839819e-10, 5.702485705860738e-10, 5.746036979559221e-10, 5.790077306500052e-10, 5.83462111958255e-10, 5.879682296594524e-10, 5.925275825546805e-10, 5.971417249561739e-10, 6.01812211176167e-10, 6.065408175714992e-10, 6.113292094767075e-10, 6.16179329782085e-10, 6.21092954844471e-10, 6.260721940876124e-10, 6.311191569352559e-10, 6.362359528111483e-10, 6.414249686947926e-10, 6.466885360545405e-10, 6.520292639144998e-10, 6.574497612987784e-10, 6.629528592760892e-10, 6.685415554485985e-10, 6.742187919073217e-10, 6.799880103436351e-10, 6.858525969377638e-10, 6.918161599145378e-10, 6.978825850545434e-10, 7.040559801829716e-10, 7.103406751696184e-10, 7.167412219288849e-10, 7.232625609532306e-10, 7.2990985477972e-10, 7.366885990123251e-10, 7.436047333442275e-10, 7.506645305355164e-10, 7.57874762946642e-10, 7.652426470272644e-10, 7.727759543385559e-10, 7.804830115532013e-10, 7.883728114777e-10, 7.964550685635174e-10, 8.047402189070851e-10, 8.132396422944055e-10, 8.219657177122031e-10, 8.309318788590758e-10, 8.401527806789488e-10, 8.496445214056791e-10, 8.594246980742071e-10, 8.695127395874636e-10, 8.799300732498239e-10, 8.90700457834015e-10, 9.01850316648023e-10, 9.134091816243028e-10, 9.254100818978372e-10, 9.37890431984556e-10, 9.508922538259412e-10, 9.64463842123564e-10, 9.78660263939446e-10, 9.935448019859905e-10, 1.0091912860943353e-09, 1.0256859805934937e-09, 1.0431305819125214e-09, 1.0616465484503124e-09, 1.0813799855569073e-09, 1.1025096391392708e-09, 1.1252564435793033e-09, 1.149898620766976e-09, 1.176793218427008e-09, 1.2064089727203964e-09, 1.2393785997488749e-09, 1.2765849488616254e-09, 1.319313880365769e-09, 1.36954347862428e-09, 1.4305497897382224e-09, 1.5083649884672923e-09, 1.6160853766322703e-09, 1.7921247819074893e-09]);
		fe = $toNativeArray($kindFloat32, [1, 0.9381436705589294, 0.900469958782196, 0.8717043399810791, 0.847785472869873, 0.8269932866096497, 0.8084216713905334, 0.7915276288986206, 0.7759568691253662, 0.7614634037017822, 0.7478685975074768, 0.7350381016731262, 0.7228676676750183, 0.7112747430801392, 0.7001926302909851, 0.6895664930343628, 0.6793505549430847, 0.669506311416626, 0.6600008606910706, 0.6508058309555054, 0.6418967247009277, 0.633251965045929, 0.62485271692276, 0.6166821718215942, 0.608725368976593, 0.6009689569473267, 0.5934008955955505, 0.5860103368759155, 0.5787873864173889, 0.5717230439186096, 0.5648092031478882, 0.5580382943153381, 0.5514034032821655, 0.5448982119560242, 0.5385168790817261, 0.5322538614273071, 0.526104211807251, 0.5200631618499756, 0.5141264200210571, 0.5082897543907166, 0.5025495290756226, 0.4969019889831543, 0.4913438558578491, 0.4858720004558563, 0.48048335313796997, 0.4751752018928528, 0.4699448347091675, 0.4647897481918335, 0.4597076177597046, 0.4546961486339569, 0.4497532546520233, 0.44487687945365906, 0.4400651156902313, 0.4353161156177521, 0.4306281507015228, 0.42599955201148987, 0.42142874002456665, 0.4169141948223114, 0.4124544560909271, 0.40804818272590637, 0.4036940038204193, 0.39939069747924805, 0.3951369822025299, 0.39093172550201416, 0.38677382469177246, 0.38266217708587646, 0.378595769405365, 0.37457355856895447, 0.37059465050697327, 0.366658091545105, 0.362762987613678, 0.358908474445343, 0.35509374737739563, 0.35131800174713135, 0.3475804924964905, 0.34388044476509094, 0.34021714329719543, 0.33658990263938904, 0.3329980671405792, 0.3294409513473511, 0.32591795921325684, 0.32242849469184875, 0.3189719021320343, 0.3155476748943329, 0.31215524673461914, 0.3087940812110901, 0.30546361207962036, 0.30216339230537415, 0.29889291524887085, 0.29565170407295227, 0.2924392819404602, 0.2892552316188812, 0.28609907627105713, 0.2829704284667969, 0.27986884117126465, 0.2767939269542694, 0.2737452983856201, 0.2707225978374481, 0.26772540807724, 0.26475343108177185, 0.2618062496185303, 0.258883535861969, 0.2559850215911865, 0.25311028957366943, 0.25025907158851624, 0.24743106961250305, 0.2446259707212448, 0.24184346199035645, 0.23908329010009766, 0.23634515702724457, 0.2336287796497345, 0.23093391954898834, 0.22826029360294342, 0.22560766339302063, 0.22297576069831848, 0.22036437690258026, 0.21777324378490448, 0.21520215272903442, 0.212650865316391, 0.21011915802955627, 0.20760682225227356, 0.20511364936828613, 0.20263944566249847, 0.20018397271633148, 0.19774706661701202, 0.1953285187482834, 0.19292815029621124, 0.19054576754570007, 0.18818120658397675, 0.18583425879478455, 0.18350479006767273, 0.18119260668754578, 0.17889754474163055, 0.17661945521831512, 0.17435817420482635, 0.1721135377883911, 0.16988539695739746, 0.16767361760139465, 0.16547803580760956, 0.16329853236675262, 0.16113494336605072, 0.1589871346950531, 0.15685498714447021, 0.15473836660385132, 0.15263713896274567, 0.1505511850118637, 0.1484803706407547, 0.14642459154129028, 0.1443837285041809, 0.14235764741897583, 0.1403462439775467, 0.13834942877292633, 0.136367067694664, 0.13439907133579254, 0.1324453204870224, 0.1305057406425476, 0.12858019769191742, 0.12666863203048706, 0.12477091699838638, 0.12288697808980942, 0.1210167184472084, 0.11916005611419678, 0.11731690168380737, 0.11548716574907303, 0.11367076635360718, 0.11186762899160385, 0.11007767915725708, 0.1083008274435997, 0.10653700679540634, 0.10478614270687103, 0.1030481606721878, 0.10132300108671188, 0.0996105819940567, 0.09791085124015808, 0.09622374176979065, 0.09454918652772903, 0.09288713335990906, 0.09123751521110535, 0.08960027992725372, 0.08797537535429001, 0.08636274188756943, 0.0847623273730278, 0.08317409455776215, 0.08159798383712769, 0.08003395050764084, 0.07848194986581802, 0.07694194465875626, 0.07541389018297195, 0.07389774918556213, 0.07239348441362381, 0.070901058614254, 0.06942043453454971, 0.06795158982276917, 0.06649449467658997, 0.06504911929368973, 0.06361543387174606, 0.06219341605901718, 0.06078304722905159, 0.0593843050301075, 0.05799717456102371, 0.05662164092063904, 0.05525768920779228, 0.05390531197190285, 0.05256449431180954, 0.05123523622751236, 0.04991753399372101, 0.04861138388514519, 0.047316793352365494, 0.04603376239538193, 0.044762298464775085, 0.04350241273641586, 0.04225412383675575, 0.04101744294166565, 0.039792392402887344, 0.03857899457216263, 0.03737728297710419, 0.03618728369474411, 0.03500903770327568, 0.03384258225560188, 0.0326879620552063, 0.031545232981443405, 0.030414443463087082, 0.0292956605553627, 0.028188949450850487, 0.027094384655356407, 0.02601204626262188, 0.024942025542259216, 0.023884421214461327, 0.022839335724711418, 0.021806888282299042, 0.020787203684449196, 0.019780423492193222, 0.018786700442433357, 0.017806200310587883, 0.016839107498526573, 0.015885621309280396, 0.014945968054234982, 0.01402039173990488, 0.013109165243804455, 0.012212592177093029, 0.011331013403832912, 0.010464809834957123, 0.009614413604140282, 0.008780314587056637, 0.007963077165186405, 0.007163353264331818, 0.0063819061033427715, 0.005619642324745655, 0.004877655766904354, 0.004157294984906912, 0.003460264764726162, 0.0027887988835573196, 0.0021459676790982485, 0.001536299823783338, 0.0009672692976891994, 0.0004541343660093844]);
		kn = $toNativeArray($kindUint32, [1991057938, 0, 1611602771, 1826899878, 1918584482, 1969227037, 2001281515, 2023368125, 2039498179, 2051788381, 2061460127, 2069267110, 2075699398, 2081089314, 2085670119, 2089610331, 2093034710, 2096037586, 2098691595, 2101053571, 2103168620, 2105072996, 2106796166, 2108362327, 2109791536, 2111100552, 2112303493, 2113412330, 2114437283, 2115387130, 2116269447, 2117090813, 2117856962, 2118572919, 2119243101, 2119871411, 2120461303, 2121015852, 2121537798, 2122029592, 2122493434, 2122931299, 2123344971, 2123736059, 2124106020, 2124456175, 2124787725, 2125101763, 2125399283, 2125681194, 2125948325, 2126201433, 2126441213, 2126668298, 2126883268, 2127086657, 2127278949, 2127460589, 2127631985, 2127793506, 2127945490, 2128088244, 2128222044, 2128347141, 2128463758, 2128572095, 2128672327, 2128764606, 2128849065, 2128925811, 2128994934, 2129056501, 2129110560, 2129157136, 2129196237, 2129227847, 2129251929, 2129268426, 2129277255, 2129278312, 2129271467, 2129256561, 2129233410, 2129201800, 2129161480, 2129112170, 2129053545, 2128985244, 2128906855, 2128817916, 2128717911, 2128606255, 2128482298, 2128345305, 2128194452, 2128028813, 2127847342, 2127648860, 2127432031, 2127195339, 2126937058, 2126655214, 2126347546, 2126011445, 2125643893, 2125241376, 2124799783, 2124314271, 2123779094, 2123187386, 2122530867, 2121799464, 2120980787, 2120059418, 2119015917, 2117825402, 2116455471, 2114863093, 2112989789, 2110753906, 2108037662, 2104664315, 2100355223, 2094642347, 2086670106, 2074676188, 2054300022, 2010539237]);
		wn = $toNativeArray($kindFloat32, [1.7290404663583558e-09, 1.2680928529462676e-10, 1.689751810696194e-10, 1.9862687883343e-10, 2.223243117382978e-10, 2.4244936613904144e-10, 2.601613091623989e-10, 2.761198769629658e-10, 2.9073962681813725e-10, 3.042996965518796e-10, 3.169979556627567e-10, 3.289802041894774e-10, 3.4035738116777736e-10, 3.5121602848242617e-10, 3.61625090983253e-10, 3.7164057942185025e-10, 3.813085680537398e-10, 3.906675816178762e-10, 3.997501218933053e-10, 4.0858399996679395e-10, 4.1719308563337165e-10, 4.255982233303257e-10, 4.3381759295968436e-10, 4.4186720948857783e-10, 4.497613115272969e-10, 4.57512583373898e-10, 4.6513240481438345e-10, 4.726310454117311e-10, 4.800177477726209e-10, 4.873009773476156e-10, 4.944885056978876e-10, 5.015873272284921e-10, 5.086040477664255e-10, 5.155446070048697e-10, 5.224146670812502e-10, 5.292193350214802e-10, 5.359634958068682e-10, 5.426517013518151e-10, 5.492881705038144e-10, 5.558769555769061e-10, 5.624218868405251e-10, 5.689264614971989e-10, 5.75394121238304e-10, 5.818281967329142e-10, 5.882316855831959e-10, 5.946076964136182e-10, 6.009590047817426e-10, 6.072883862451306e-10, 6.135985053390414e-10, 6.19892026598734e-10, 6.261713370037114e-10, 6.324390455780815e-10, 6.386973727678935e-10, 6.449488165749528e-10, 6.511955974453087e-10, 6.574400468473129e-10, 6.636843297158634e-10, 6.699307220081607e-10, 6.761814441702541e-10, 6.824387166481927e-10, 6.887046488657234e-10, 6.949815167800466e-10, 7.012714853260604e-10, 7.075767749498141e-10, 7.13899661608508e-10, 7.202424212593428e-10, 7.266072743483676e-10, 7.329966078550854e-10, 7.394128087589991e-10, 7.458582640396116e-10, 7.523354716987285e-10, 7.588469852493063e-10, 7.653954137154528e-10, 7.719834771435785e-10, 7.786139510912449e-10, 7.852897221383159e-10, 7.920137878869582e-10, 7.987892014504894e-10, 8.056192379868321e-10, 8.125072836762115e-10, 8.194568912323064e-10, 8.264716688799467e-10, 8.3355555791087e-10, 8.407127216614185e-10, 8.479473234679347e-10, 8.552640262671218e-10, 8.626675485068347e-10, 8.701631637464402e-10, 8.777562010564566e-10, 8.854524335966119e-10, 8.932581896381464e-10, 9.011799639857543e-10, 9.092249730890956e-10, 9.174008219758889e-10, 9.25715837318819e-10, 9.341788453909317e-10, 9.42799727177146e-10, 9.515889187738935e-10, 9.605578554783278e-10, 9.697193048552322e-10, 9.790869226478094e-10, 9.886760299337993e-10, 9.985036131254788e-10, 1.008588212947359e-09, 1.0189509236369076e-09, 1.0296150598776421e-09, 1.040606933955246e-09, 1.0519566329136865e-09, 1.0636980185552147e-09, 1.0758701707302976e-09, 1.0885182755160372e-09, 1.101694735439196e-09, 1.115461056855338e-09, 1.1298901814171813e-09, 1.1450695946990663e-09, 1.1611052119775422e-09, 1.178127595480305e-09, 1.1962995039027646e-09, 1.2158286599728285e-09, 1.2369856250415978e-09, 1.2601323318151003e-09, 1.2857697129220469e-09, 1.3146201904845611e-09, 1.3477839955200466e-09, 1.3870635751089821e-09, 1.43574030442295e-09, 1.5008658760251592e-09, 1.6030947680434338e-09]);
		fn = $toNativeArray($kindFloat32, [1, 0.963599681854248, 0.9362826943397522, 0.9130436182022095, 0.8922816514968872, 0.8732430338859558, 0.8555005788803101, 0.8387836217880249, 0.8229072093963623, 0.8077383041381836, 0.7931770086288452, 0.7791460752487183, 0.7655841708183289, 0.7524415850639343, 0.7396772503852844, 0.7272568941116333, 0.7151514887809753, 0.7033361196517944, 0.6917891502380371, 0.6804918646812439, 0.6694276928901672, 0.6585819721221924, 0.6479418277740479, 0.6374954581260681, 0.6272324919700623, 0.6171433925628662, 0.6072195172309875, 0.5974531769752502, 0.5878370404243469, 0.5783646702766418, 0.5690299868583679, 0.5598273873329163, 0.550751805305481, 0.5417983531951904, 0.5329626798629761, 0.5242405533790588, 0.5156282186508179, 0.5071220397949219, 0.49871864914894104, 0.4904148280620575, 0.48220765590667725, 0.47409430146217346, 0.466072142124176, 0.45813870429992676, 0.45029163360595703, 0.44252872467041016, 0.4348478317260742, 0.42724698781967163, 0.41972434520721436, 0.41227802634239197, 0.40490642189979553, 0.39760786294937134, 0.3903807997703552, 0.3832238018512726, 0.3761354684829712, 0.3691144585609436, 0.36215949058532715, 0.3552693724632263, 0.3484429717063904, 0.3416791558265686, 0.33497685194015503, 0.32833510637283325, 0.3217529058456421, 0.3152293860912323, 0.30876362323760986, 0.3023548424243927, 0.2960021495819092, 0.2897048592567444, 0.28346219658851624, 0.2772735059261322, 0.271138072013855, 0.2650552988052368, 0.25902456045150757, 0.25304529070854187, 0.24711695313453674, 0.24123899638652802, 0.23541094362735748, 0.22963231801986694, 0.22390270233154297, 0.21822164952754974, 0.21258877217769623, 0.20700371265411377, 0.20146611332893372, 0.1959756463766098, 0.19053204357624054, 0.18513499200344086, 0.17978426814079285, 0.1744796335697174, 0.16922089457511902, 0.16400785744190216, 0.1588403731584549, 0.15371830761432648, 0.14864157140254974, 0.14361007511615753, 0.13862377405166626, 0.13368265330791473, 0.12878671288490295, 0.12393598258495331, 0.11913054436445236, 0.11437050998210907, 0.10965602099895477, 0.1049872562289238, 0.10036443918943405, 0.09578784555196762, 0.09125780314207077, 0.08677466958761215, 0.08233889937400818, 0.07795098423957825, 0.07361150532960892, 0.06932111829519272, 0.06508058309555054, 0.06089077144861221, 0.05675266310572624, 0.05266740173101425, 0.048636294901371, 0.044660862535238266, 0.040742866694927216, 0.03688438981771469, 0.03308788686990738, 0.029356317594647408, 0.025693291798233986, 0.02210330404341221, 0.018592102453112602, 0.015167297795414925, 0.011839478276669979, 0.0086244847625494, 0.005548994988203049, 0.0026696291752159595]);
		rngCooked = $toNativeArray($kindInt64, [new $Int64(-973649357, 3952672746), new $Int64(-1065661887, 3130416987), new $Int64(324977939, 3414273807), new $Int64(1241840476, 2806224363), new $Int64(-1477934308, 1997590414), new $Int64(2103305448, 2402795971), new $Int64(1663160183, 1140819369), new $Int64(1120601685, 1788868961), new $Int64(1848035537, 1089001426), new $Int64(1235702047, 873593504), new $Int64(1911387977, 581324885), new $Int64(-1654874170, 1609182556), new $Int64(1069394745, 1241596776), new $Int64(1895445337, 1771189259), new $Int64(-1374618802, 3467012610), new $Int64(-140526423, 2344407434), new $Int64(-1745367887, 782467244), new $Int64(26335124, 3404933915), new $Int64(1063924276, 618867887), new $Int64(-968700782, 520164395), new $Int64(-1591572833, 1341358184), new $Int64(-1515085039, 665794848), new $Int64(1527227641, 3183648150), new $Int64(1781176124, 696329606), new $Int64(1789146075, 4151988961), new $Int64(-2087444114, 998951326), new $Int64(-612324923, 1364957564), new $Int64(63173359, 4090230633), new $Int64(-1498029007, 4009697548), new $Int64(248009524, 2569622517), new $Int64(778703922, 3742421481), new $Int64(-1109106023, 1506914633), new $Int64(1738099768, 1983412561), new $Int64(236311649, 1436266083), new $Int64(-1111517500, 3922894967), new $Int64(-1336974714, 1792680179), new $Int64(563141142, 1188796351), new $Int64(1349617468, 405968250), new $Int64(1044074554, 433754187), new $Int64(870549669, 4073162024), new $Int64(-1094251604, 433121399), new $Int64(2451824, 4162580594), new $Int64(-137262572, 4132415622), new $Int64(-1536231048, 3033822028), new $Int64(2016407895, 824682382), new $Int64(2366218, 3583765414), new $Int64(-624604839, 535386927), new $Int64(1637219058, 2286693689), new $Int64(1453075389, 2968466525), new $Int64(193683513, 1351410206), new $Int64(-283806096, 1412813499), new $Int64(492736522, 4126267639), new $Int64(512765208, 2105529399), new $Int64(2132966268, 2413882233), new $Int64(947457634, 32226200), new $Int64(1149341356, 2032329073), new $Int64(106485445, 1356518208), new $Int64(-2067810156, 3430061722), new $Int64(-1484435135, 3820169661), new $Int64(-1665985194, 2981816134), new $Int64(1017155588, 4184371017), new $Int64(206574701, 2119206761), new $Int64(-852109057, 2472200560), new $Int64(-560457548, 2853524696), new $Int64(1307803389, 1681119904), new $Int64(-174986835, 95608918), new $Int64(392686347, 3690479145), new $Int64(-1205570926, 1397922290), new $Int64(-1159314025, 1516129515), new $Int64(-320178155, 1547420459), new $Int64(1311333971, 1470949486), new $Int64(-1953469798, 1336785672), new $Int64(-45086614, 4131677129), new $Int64(-1392278100, 4246329084), new $Int64(-1142500187, 3788585631), new $Int64(-66478285, 3080389532), new $Int64(-646438364, 2215402037), new $Int64(391002300, 1171593935), new $Int64(1408774047, 1423855166), new $Int64(-519177718, 2276716302), new $Int64(-368453140, 2068027241), new $Int64(1369359303, 3427553297), new $Int64(189241615, 3289637845), new $Int64(1057480830, 3486407650), new $Int64(-1512910664, 3071877822), new $Int64(1159653919, 3363620705), new $Int64(-934256930, 4159821533), new $Int64(-76621938, 1894661), new $Int64(-674493898, 1156868282), new $Int64(348271067, 776219088), new $Int64(-501428838, 2425634259), new $Int64(1716021749, 680510161), new $Int64(-574263456, 1310101429), new $Int64(1095885995, 2964454134), new $Int64(-325695512, 3467098407), new $Int64(1990672920, 2109628894), new $Int64(-2139648704, 1232604732), new $Int64(-1838070714, 3261916179), new $Int64(1699175360, 434597899), new $Int64(235436061, 1624796439), new $Int64(-1626402839, 3589632480), new $Int64(1198416575, 864579159), new $Int64(-1938748161, 1380889830), new $Int64(619206309, 2654509477), new $Int64(1419738251, 1468209306), new $Int64(-1744284772, 100794388), new $Int64(-1191421458, 2991674471), new $Int64(-208666741, 2224662036), new $Int64(-173659161, 977097250), new $Int64(1351320195, 726419512), new $Int64(-183459897, 1747974366), new $Int64(-753095183, 1556430604), new $Int64(-1049492215, 1080776742), new $Int64(-385846958, 280794874), new $Int64(117767733, 919835643), new $Int64(-967009426, 3434019658), new $Int64(-1951414480, 2461941785), new $Int64(133215641, 3615001066), new $Int64(417204809, 3103414427), new $Int64(790056561, 3380809712), new $Int64(-1267681408, 2724693469), new $Int64(547796833, 598827710), new $Int64(-1846559452, 3452273442), new $Int64(-75778224, 649274915), new $Int64(-801301329, 2585724112), new $Int64(-1510934263, 3165579553), new $Int64(1185578221, 2635894283), new $Int64(-52910178, 2053289721), new $Int64(985976581, 3169337108), new $Int64(1170569632, 144717764), new $Int64(1079216270, 1383666384), new $Int64(-124804942, 681540375), new $Int64(1375448925, 537050586), new $Int64(-1964768344, 315246468), new $Int64(226402871, 849323088), new $Int64(-885062465, 45543944), new $Int64(-946445250, 2319052083), new $Int64(-40708194, 3613090841), new $Int64(560472520, 2992171180), new $Int64(-381863169, 2068244785), new $Int64(917538188, 4239862634), new $Int64(-1369555809, 3892253031), new $Int64(720683925, 958186149), new $Int64(-423297785, 1877702262), new $Int64(1357886971, 837674867), new $Int64(1837048883, 1507589294), new $Int64(1905518400, 873336795), new $Int64(-1879761037, 2764496274), new $Int64(-1806480530, 4196182374), new $Int64(-1066765755, 550964545), new $Int64(818747069, 420611474), new $Int64(-1924830376, 204265180), new $Int64(1549974541, 1787046383), new $Int64(1215581865, 3102292318), new $Int64(418321538, 1552199393), new $Int64(1243493047, 980542004), new $Int64(267284263, 3293718720), new $Int64(1179528763, 3771917473), new $Int64(599484404, 2195808264), new $Int64(252818753, 3894702887), new $Int64(-1367475956, 2099949527), new $Int64(1424094358, 338442522), new $Int64(490737398, 637158004), new $Int64(-1727621530, 281976339), new $Int64(574970164, 3619802330), new $Int64(-431930823, 3084554784), new $Int64(-1264611183, 4129772886), new $Int64(-2104399043, 1680378557), new $Int64(-1621962591, 3339087776), new $Int64(1680500332, 4220317857), new $Int64(-1935828963, 2959322499), new $Int64(1675600481, 1488354890), new $Int64(-834863562, 3958162143), new $Int64(-1226511573, 2773705983), new $Int64(1876039582, 225908689), new $Int64(-1183735113, 908216283), new $Int64(-605696219, 3574646075), new $Int64(-1827723091, 1936937569), new $Int64(1519770881, 75492235), new $Int64(816689472, 1935193178), new $Int64(2142521206, 2018250883), new $Int64(455141620, 3943126022), new $Int64(-601399488, 3066544345), new $Int64(1932392669, 2793082663), new $Int64(-1239009361, 3297036421), new $Int64(1640597065, 2206987825), new $Int64(-553246738, 807894872), new $Int64(-1781325307, 766252117), new $Int64(2060649606, 3833114345), new $Int64(845619743, 1255067973), new $Int64(1201145605, 741697208), new $Int64(-1476242608, 2810093753), new $Int64(1109032642, 4229340371), new $Int64(1462188720, 1361684224), new $Int64(-1159399429, 1906263026), new $Int64(475781207, 3904421704), new $Int64(-623537128, 1769075545), new $Int64(1062308525, 2621599764), new $Int64(1279509432, 3431891480), new $Int64(-1742751146, 1871896503), new $Int64(128756421, 1412808876), new $Int64(1605404688, 952876175), new $Int64(-230443691, 1824438899), new $Int64(1662295856, 1005035476), new $Int64(-156574141, 527508597), new $Int64(1288873303, 3066806859), new $Int64(565995893, 3244940914), new $Int64(-889746188, 209092916), new $Int64(-247669406, 1242699167), new $Int64(-713830396, 456723774), new $Int64(1776978905, 1001252870), new $Int64(1468772157, 2026725874), new $Int64(857254202, 2137562569), new $Int64(765939740, 3183366709), new $Int64(1533887628, 2612072960), new $Int64(56977098, 1727148468), new $Int64(-1197583895, 3803658212), new $Int64(1883670356, 479946959), new $Int64(685713571, 1562982345), new $Int64(-1946242443, 1766109365), new $Int64(700596547, 3257093788), new $Int64(-184714929, 2365720207), new $Int64(93384808, 3742754173), new $Int64(-458385235, 2878193673), new $Int64(1096135042, 2174002182), new $Int64(-834260953, 3573511231), new $Int64(-754572527, 1760299077), new $Int64(-1375627191, 2260779833), new $Int64(-866019274, 1452805722), new $Int64(-1229671918, 2940011802), new $Int64(1890251082, 1886183802), new $Int64(893897673, 2514369088), new $Int64(1644345561, 3924317791), new $Int64(-1974867432, 500935732), new $Int64(1403501753, 676580929), new $Int64(-1565912283, 1184984890), new $Int64(-691968413, 1271474274), new $Int64(-1828754738, 3163791473), new $Int64(2051027584, 2842487377), new $Int64(1511537551, 2170968612), new $Int64(573262976, 3535856740), new $Int64(-2053227187, 1488599718), new $Int64(-1180531831, 3408913763), new $Int64(-2086531912, 2501050084), new $Int64(-875130448, 1639124157), new $Int64(-2009482504, 4088176393), new $Int64(1574896563, 3989947576), new $Int64(-165243708, 3414355209), new $Int64(-792329287, 2275136352), new $Int64(-2057774345, 2151835223), new $Int64(-931144933, 1654534827), new $Int64(-679921451, 377892833), new $Int64(-482716010, 660204544), new $Int64(85706799, 390828249), new $Int64(-1422172693, 3402783878), new $Int64(-1468634160, 3717936603), new $Int64(1113532086, 2211058823), new $Int64(1564224320, 2692150867), new $Int64(1952770442, 1928910388), new $Int64(788716862, 3931011137), new $Int64(1083670504, 1112701047), new $Int64(-68150572, 2452299106), new $Int64(-896164822, 2337204777), new $Int64(1774877857, 273889282), new $Int64(1798719843, 1462008793), new $Int64(2138834788, 1554494002), new $Int64(-1194967131, 182675323), new $Int64(-1598554764, 1882802136), new $Int64(589279648, 3700220025), new $Int64(381039426, 3083431543), new $Int64(-851859191, 3622207527), new $Int64(338126939, 432729309), new $Int64(-1667470126, 2391914317), new $Int64(-1849558151, 235747924), new $Int64(2120733629, 3088823825), new $Int64(-745079795, 2314658321), new $Int64(1165929723, 2957634338), new $Int64(501323675, 4117056981), new $Int64(1564699815, 1482500298), new $Int64(-740826490, 840489337), new $Int64(799522364, 3483178565), new $Int64(532129761, 2074004656), new $Int64(724246478, 3643392642), new $Int64(-665153481, 1583624461), new $Int64(-885822954, 287473085), new $Int64(1667835381, 3136843981), new $Int64(1138806821, 1266970974), new $Int64(135185781, 1998688839), new $Int64(392094735, 1492900209), new $Int64(1031326774, 1538112737), new $Int64(-2070568842, 2207265429), new $Int64(-1886797613, 963263315), new $Int64(1671145500, 2295892134), new $Int64(1068469660, 2002560897), new $Int64(-356250305, 1369254035), new $Int64(33436120, 3353312708), new $Int64(57507843, 947771099), new $Int64(-1945755145, 1747061399), new $Int64(1507240140, 2047354631), new $Int64(720000810, 4165367136), new $Int64(479265078, 3388864963), new $Int64(-952181250, 286492130), new $Int64(2045622690, 2795735007), new $Int64(-715730566, 3703961339), new $Int64(-148436487, 1797825479), new $Int64(1429039600, 1116589674), new $Int64(-1665420098, 2593309206), new $Int64(1329049334, 3404995677), new $Int64(-750579440, 3453462936), new $Int64(1014767077, 3016498634), new $Int64(75698599, 1650371545), new $Int64(1592007860, 212344364), new $Int64(1127766888, 3843932156), new $Int64(-748019856, 3573129983), new $Int64(-890581831, 665897820), new $Int64(1071492673, 1675628772), new $Int64(243225682, 2831752928), new $Int64(2120298836, 1486294219), new $Int64(-1954407413, 268782709), new $Int64(-1002123503, 4186179080), new $Int64(624342951, 1613720397), new $Int64(857179861, 2703686015), new $Int64(-911618704, 2205342611), new $Int64(-672703993, 1411666394), new $Int64(-1528454899, 677744900), new $Int64(-1876628533, 4172867247), new $Int64(135494707, 2163418403), new $Int64(849547544, 2841526879), new $Int64(-1117516959, 1082141470), new $Int64(-1770111792, 4046134367), new $Int64(51415528, 2142943655), new $Int64(-249824333, 3124627521), new $Int64(998228909, 219992939), new $Int64(-1078790951, 1756846531), new $Int64(1283749206, 1225118210), new $Int64(-525858006, 1647770243), new $Int64(-2035959705, 444807907), new $Int64(2036369448, 3952076173), new $Int64(53201823, 1461839639), new $Int64(315761893, 3699250910), new $Int64(702974850, 1373688981), new $Int64(734022261, 147523747), new $Int64(-2047330906, 1211276581), new $Int64(1294440951, 2548832680), new $Int64(1144696256, 1995631888), new $Int64(-1992983070, 2011457303), new $Int64(-1351022674, 3057425772), new $Int64(667839456, 81484597), new $Int64(-1681980888, 3646681560), new $Int64(-1372462725, 635548515), new $Int64(602489502, 2508044581), new $Int64(-1794220117, 1014917157), new $Int64(719992433, 3214891315), new $Int64(-1294799037, 959582252), new $Int64(226415134, 3347040449), new $Int64(-362868096, 4102971975), new $Int64(397887437, 4078022210), new $Int64(-536803826, 2851767182), new $Int64(-1398321012, 1540160644), new $Int64(-1549098876, 1057290595), new $Int64(-112592988, 3907769253), new $Int64(579300318, 4248952684), new $Int64(-1054576049, 132554364), new $Int64(-1085862414, 1029351092), new $Int64(697840928, 2583007416), new $Int64(298619124, 1486185789), new $Int64(55905697, 2871589073), new $Int64(2017643612, 723203291), new $Int64(146250550, 2494333952), new $Int64(-1082993397, 2230939180), new $Int64(-1804568072, 3943232912), new $Int64(1768732449, 2181367922), new $Int64(-729261111, 2889274791), new $Int64(1824032949, 2046728161), new $Int64(1653899792, 1376052477), new $Int64(1022327048, 381236993), new $Int64(-1113097690, 3188942166), new $Int64(-74480109, 350070824), new $Int64(144881592, 61758415), new $Int64(-741824226, 3492950336), new $Int64(-2030042720, 3093818430), new $Int64(-453590535, 2962480613), new $Int64(-1912050708, 3154871160), new $Int64(-1636478569, 3228564679), new $Int64(610731502, 888276216), new $Int64(-946702974, 3574998604), new $Int64(-1277068380, 1967526716), new $Int64(-1556147941, 1554691298), new $Int64(-1573024234, 339944798), new $Int64(1223764147, 1154515356), new $Int64(1825645307, 967516237), new $Int64(1546195135, 596588202), new $Int64(-1867600880, 3764362170), new $Int64(-1655392592, 266611402), new $Int64(-393255880, 2047856075), new $Int64(-1000726433, 21444105), new $Int64(-949424754, 3065563181), new $Int64(-232418803, 1140663212), new $Int64(633187674, 2323741028), new $Int64(2126290159, 3103873707), new $Int64(1008658319, 2766828349), new $Int64(-485587503, 1970872996), new $Int64(1628585413, 3766615585), new $Int64(-595148528, 2036813414), new $Int64(-1994877121, 3105536507), new $Int64(13954645, 3396176938), new $Int64(-721402003, 1377154485), new $Int64(-61839181, 3807014186), new $Int64(543009040, 3710110597), new $Int64(-1751425519, 916420443), new $Int64(734556788, 2103831255), new $Int64(-1766161494, 717331943), new $Int64(-1574598896, 3550505941), new $Int64(45939673, 378749927), new $Int64(-1997615719, 611017331), new $Int64(592130075, 758907650), new $Int64(1012992349, 154266815), new $Int64(-1040454942, 1407468696), new $Int64(-1678191250, 970098704), new $Int64(-285057486, 1971660656), new $Int64(998365243, 3332747885), new $Int64(1947089649, 1935189867), new $Int64(1510248801, 203520055), new $Int64(-1305165746, 3916463034), new $Int64(-388598655, 3474113316), new $Int64(1036101639, 316544223), new $Int64(-1773744891, 1650844677), new $Int64(-907191419, 4267565603), new $Int64(-1070275024, 2501167616), new $Int64(-1520651863, 3929401789), new $Int64(-2091360852, 337170252), new $Int64(-960502090, 2061966842), new $Int64(-304190848, 2508461464), new $Int64(-1941471116, 2791377107), new $Int64(1240791848, 1227227588), new $Int64(1813978778, 1709681848), new $Int64(1153692192, 3768820575), new $Int64(-1002297449, 2887126398), new $Int64(-1447111334, 296561685), new $Int64(700300844, 3729960077), new $Int64(-1572311344, 372833036), new $Int64(2078875613, 2409779288), new $Int64(1829161290, 555274064), new $Int64(-1105595719, 4239804901), new $Int64(1839403216, 3723486978), new $Int64(-1649093095, 2145871984), new $Int64(-1582765715, 3565480803), new $Int64(-1568653827, 2197313814), new $Int64(974785092, 3613674566), new $Int64(438638731, 3042093666), new $Int64(-96556264, 3324034321), new $Int64(869420878, 3708873369), new $Int64(946682149, 1698090092), new $Int64(1618900382, 4213940712), new $Int64(-1843479747, 2087477361), new $Int64(-1766167800, 2407950639), new $Int64(-1296225558, 3942568569), new $Int64(-1223900450, 4088074412), new $Int64(723260036, 2964773675), new $Int64(-673921829, 1539178386), new $Int64(1062961552, 2694849566), new $Int64(460977733, 2120273838), new $Int64(-1604570740, 2484608657), new $Int64(880846449, 2956190677), new $Int64(1970902366, 4223313749), new $Int64(662161910, 3502682327), new $Int64(705634754, 4133891139), new $Int64(-1031359300, 1166449596), new $Int64(1038247601, 3362705993), new $Int64(93734798, 3892921029), new $Int64(1876124043, 786869787), new $Int64(1057490746, 1046342263), new $Int64(242763728, 493777327), new $Int64(-853573201, 3304827646), new $Int64(616460742, 125356352), new $Int64(499300063, 74094113), new $Int64(-795586925, 2500816079), new $Int64(-490248444, 514015239), new $Int64(1377565129, 543520454), new $Int64(-2039776725, 3614531153), new $Int64(2056746300, 2356753985), new $Int64(1390062617, 2018141668), new $Int64(131272971, 2087974891), new $Int64(-1502927041, 3166972343), new $Int64(372256200, 1517638666), new $Int64(-935275664, 173466846), new $Int64(-695774461, 4241513471), new $Int64(-1413550842, 2783126920), new $Int64(1972004134, 4167264826), new $Int64(29260506, 3907395640), new $Int64(-910901561, 1539634186), new $Int64(-595957298, 178241987), new $Int64(-113277636, 182168164), new $Int64(-1102530459, 2386154934), new $Int64(1379126408, 4077374341), new $Int64(-2114679722, 1732699140), new $Int64(-421057745, 1041306002), new $Int64(1860414813, 2068001749), new $Int64(1005320202, 3208962910), new $Int64(844054010, 697710380), new $Int64(-1509359403, 2228431183), new $Int64(-810313977, 3554678728), new $Int64(-750989047, 173470263), new $Int64(-85886265, 3848297795), new $Int64(-926936977, 246236185), new $Int64(-1984190461, 2066374846), new $Int64(1771673660, 312890749), new $Int64(703378057, 3573310289), new $Int64(-598851901, 143166754), new $Int64(613554316, 2081511079), new $Int64(1197802104, 486038032), new $Int64(-1906483789, 2982218564), new $Int64(364901986, 1000939191), new $Int64(1902782651, 2750454885), new $Int64(-671844857, 3375313137), new $Int64(-1643868040, 881302957), new $Int64(-1508784745, 2514186393), new $Int64(-1703622845, 360024739), new $Int64(1399671872, 292500025), new $Int64(1381210821, 2276300752), new $Int64(521803381, 4069087683), new $Int64(-1938982667, 1637778212), new $Int64(720490469, 1676670893), new $Int64(1067262482, 3855174429), new $Int64(2114075974, 2067248671), new $Int64(-89426259, 2884561259), new $Int64(-805741095, 2456511185), new $Int64(983726246, 561175414), new $Int64(-1719489563, 432588903), new $Int64(885133709, 4059399550), new $Int64(-93096266, 1075014784), new $Int64(-1733832628, 2728058415), new $Int64(1839142064, 1299703678), new $Int64(1262333188, 2347583393), new $Int64(1285481956, 2468164145), new $Int64(-1158354011, 1140014346), new $Int64(2033889184, 1936972070), new $Int64(-1737578993, 3870530098), new $Int64(-484494257, 1717789158), new $Int64(-232997156, 1153452491), new $Int64(-990424416, 3948827651), new $Int64(-1357145630, 2101413152), new $Int64(1495744672, 3854091229), new $Int64(83644069, 4215565463), new $Int64(-1385277313, 1202710438), new $Int64(-564909037, 2072216740), new $Int64(705690639, 2066751068), new $Int64(-2113583312, 173902580), new $Int64(-741983806, 142459001), new $Int64(172391592, 1889151926), new $Int64(-498943125, 3034199774), new $Int64(1618587731, 516490102), new $Int64(93114264, 3692577783), new $Int64(-2078821353, 2953948865), new $Int64(-320938673, 4041040923), new $Int64(-1942517976, 592046130), new $Int64(-705643640, 384297211), new $Int64(-2051649464, 265863924), new $Int64(2101717619, 1333136237), new $Int64(1499611781, 1406273556), new $Int64(1074670496, 426305476), new $Int64(125704633, 2750898176), new $Int64(488068495, 1633944332), new $Int64(2037723464, 3236349343), new $Int64(-1703423246, 4013676611), new $Int64(1718532237, 2265047407), new $Int64(1433593806, 875071080), new $Int64(-343047503, 1418843655), new $Int64(2009228711, 451657300), new $Int64(1229446621, 1866374663), new $Int64(1653472867, 1551455622), new $Int64(577191481, 3560962459), new $Int64(1669204077, 3347903778), new $Int64(-298327194, 2675874918), new $Int64(-1831355577, 2762991672), new $Int64(530492383, 3689068477), new $Int64(844089962, 4071997905), new $Int64(1508155730, 1381702441), new $Int64(2089931018, 2373284878), new $Int64(-864267462, 2143983064), new $Int64(308739063, 1938207195), new $Int64(1754949306, 1188152253), new $Int64(1272345009, 615870490), new $Int64(742653194, 2662252621), new $Int64(1477718295, 3839976789), new $Int64(-2091334213, 306752547), new $Int64(-1426688067, 2162363077), new $Int64(-57052633, 2767224719), new $Int64(-1471624099, 2628837712), new $Int64(1678405918, 2967771969), new $Int64(1694285728, 499792248), new $Int64(-1744131281, 4285253508), new $Int64(962357072, 2856511070), new $Int64(679471692, 2526409716), new $Int64(-1793706473, 1240875658), new $Int64(-914893422, 2577342868), new $Int64(-1001298215, 4136853496), new $Int64(-1477114974, 2403540137), new $Int64(1372824515, 1371410668), new $Int64(-176562048, 371758825), new $Int64(-441063112, 1528834084), new $Int64(-71688630, 1504757260), new $Int64(-1461820072, 699052551), new $Int64(-505543539, 3347789870), new $Int64(1951619734, 3430604759), new $Int64(2119672219, 1935601723), new $Int64(966789690, 834676166)]);
		globalRand = New(new lockedSource.ptr(new nosync.Mutex.ptr(false), $assertType(NewSource(new $Int64(0, 1)), Source64)));
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["syscall"] = (function() {
	var $pkg = {}, $init, js, race, runtime, sync, mmapper, Errno, sliceType, sliceType$1, ptrType$2, arrayType$4, structType, ptrType$26, mapType, funcType$2, funcType$3, warningPrinted, lineBuffer, syscallModule, alreadyTriedToLoad, minusOne, envs, mapper, errEAGAIN, errEINVAL, errENOENT, errors, init, printWarning, printToConsole, indexByte, runtime_envs, syscallByName, Syscall, Syscall6, itoa, uitoa, errnoErr, munmap, mmap;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	race = $packages["internal/race"];
	runtime = $packages["runtime"];
	sync = $packages["sync"];
	mmapper = $pkg.mmapper = $newType(0, $kindStruct, "syscall.mmapper", true, "syscall", false, function(Mutex_, active_, mmap_, munmap_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Mutex = new sync.Mutex.ptr(0, 0);
			this.active = false;
			this.mmap = $throwNilPointerError;
			this.munmap = $throwNilPointerError;
			return;
		}
		this.Mutex = Mutex_;
		this.active = active_;
		this.mmap = mmap_;
		this.munmap = munmap_;
	});
	Errno = $pkg.Errno = $newType(4, $kindUintptr, "syscall.Errno", true, "syscall", true, null);
	sliceType = $sliceType($Uint8);
	sliceType$1 = $sliceType($String);
	ptrType$2 = $ptrType($Uint8);
	arrayType$4 = $arrayType($Uint8, 32);
	structType = $structType("syscall", [{prop: "addr", name: "addr", embedded: false, exported: false, typ: $Uintptr, tag: ""}, {prop: "len", name: "len", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "cap", name: "cap", embedded: false, exported: false, typ: $Int, tag: ""}]);
	ptrType$26 = $ptrType(mmapper);
	mapType = $mapType(ptrType$2, sliceType);
	funcType$2 = $funcType([$Uintptr, $Uintptr, $Int, $Int, $Int, $Int64], [$Uintptr, $error], false);
	funcType$3 = $funcType([$Uintptr, $Uintptr], [$error], false);
	init = function() {
		$flushConsole = (function() {
			if (!((lineBuffer.$length === 0))) {
				$global.console.log($externalize(($bytesToString(lineBuffer)), $String));
				lineBuffer = sliceType.nil;
			}
		});
	};
	printWarning = function() {
		if (!warningPrinted) {
			$global.console.error($externalize("warning: system calls not available, see https://github.com/gopherjs/gopherjs/blob/master/doc/syscalls.md", $String));
		}
		warningPrinted = true;
	};
	printToConsole = function(b) {
		var b, goPrintToConsole, i;
		goPrintToConsole = $global.goPrintToConsole;
		if (!(goPrintToConsole === undefined)) {
			goPrintToConsole(b);
			return;
		}
		lineBuffer = $appendSlice(lineBuffer, b);
		while (true) {
			i = indexByte(lineBuffer, 10);
			if (i === -1) {
				break;
			}
			$global.console.log($externalize(($bytesToString($subslice(lineBuffer, 0, i))), $String));
			lineBuffer = $subslice(lineBuffer, (i + 1 >> 0));
		}
	};
	indexByte = function(s, c) {
		var _i, _ref, b, c, i, s;
		_ref = s;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			b = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			if (b === c) {
				return i;
			}
			_i++;
		}
		return -1;
	};
	runtime_envs = function() {
		var envkeys, envs$1, i, jsEnv, key, process;
		process = $global.process;
		if (process === undefined) {
			return sliceType$1.nil;
		}
		jsEnv = process.env;
		envkeys = $global.Object.keys(jsEnv);
		envs$1 = $makeSlice(sliceType$1, $parseInt(envkeys.length));
		i = 0;
		while (true) {
			if (!(i < $parseInt(envkeys.length))) { break; }
			key = $internalize(envkeys[i], $String);
			((i < 0 || i >= envs$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : envs$1.$array[envs$1.$offset + i] = key + "=" + $internalize(jsEnv[$externalize(key, $String)], $String));
			i = i + (1) >> 0;
		}
		return envs$1;
	};
	syscallByName = function(name) {
		var name, require, $deferred;
		/* */ var $err = null; try { $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		$deferred.push([(function() {
			$recover();
		}), []]);
		if (syscallModule === null) {
			if (alreadyTriedToLoad) {
				return null;
			}
			alreadyTriedToLoad = true;
			require = $global.require;
			if (require === undefined) {
				$panic(new $String(""));
			}
			syscallModule = require($externalize("syscall", $String));
		}
		return syscallModule[$externalize(name, $String)];
		/* */ } catch(err) { $err = err; return null; } finally { $callDeferred($deferred, $err); }
	};
	Syscall = function(trap, a1, a2, a3) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, a1, a2, a3, array, err, f, r, r1, r2, slice, trap;
		r1 = 0;
		r2 = 0;
		err = 0;
		f = syscallByName("Syscall");
		if (!(f === null)) {
			r = f(trap, a1, a2, a3);
			_tmp = ((($parseInt(r[0]) >> 0) >>> 0));
			_tmp$1 = ((($parseInt(r[1]) >> 0) >>> 0));
			_tmp$2 = ((($parseInt(r[2]) >> 0) >>> 0));
			r1 = _tmp;
			r2 = _tmp$1;
			err = _tmp$2;
			return [r1, r2, err];
		}
		if ((trap === 1) && ((a1 === 1) || (a1 === 2))) {
			array = a2;
			slice = $makeSlice(sliceType, $parseInt(array.length));
			slice.$array = array;
			printToConsole(slice);
			_tmp$3 = (($parseInt(array.length) >>> 0));
			_tmp$4 = 0;
			_tmp$5 = 0;
			r1 = _tmp$3;
			r2 = _tmp$4;
			err = _tmp$5;
			return [r1, r2, err];
		}
		if (trap === 231) {
			runtime.Goexit();
		}
		printWarning();
		_tmp$6 = ((minusOne >>> 0));
		_tmp$7 = 0;
		_tmp$8 = 13;
		r1 = _tmp$6;
		r2 = _tmp$7;
		err = _tmp$8;
		return [r1, r2, err];
	};
	$pkg.Syscall = Syscall;
	Syscall6 = function(trap, a1, a2, a3, a4, a5, a6) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, a1, a2, a3, a4, a5, a6, err, f, r, r1, r2, trap;
		r1 = 0;
		r2 = 0;
		err = 0;
		f = syscallByName("Syscall6");
		if (!(f === null)) {
			r = f(trap, a1, a2, a3, a4, a5, a6);
			_tmp = ((($parseInt(r[0]) >> 0) >>> 0));
			_tmp$1 = ((($parseInt(r[1]) >> 0) >>> 0));
			_tmp$2 = ((($parseInt(r[2]) >> 0) >>> 0));
			r1 = _tmp;
			r2 = _tmp$1;
			err = _tmp$2;
			return [r1, r2, err];
		}
		if (!((trap === 202))) {
			printWarning();
		}
		_tmp$3 = ((minusOne >>> 0));
		_tmp$4 = 0;
		_tmp$5 = 13;
		r1 = _tmp$3;
		r2 = _tmp$4;
		err = _tmp$5;
		return [r1, r2, err];
	};
	$pkg.Syscall6 = Syscall6;
	itoa = function(val) {
		var val;
		if (val < 0) {
			return "-" + uitoa(((-val >>> 0)));
		}
		return uitoa(((val >>> 0)));
	};
	uitoa = function(val) {
		var _q, _r, buf, i, val;
		buf = arrayType$4.zero();
		i = 31;
		while (true) {
			if (!(val >= 10)) { break; }
			((i < 0 || i >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[i] = ((((_r = val % 10, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) + 48 >>> 0) << 24 >>> 24)));
			i = i - (1) >> 0;
			val = (_q = val / (10), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
		}
		((i < 0 || i >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[i] = (((val + 48 >>> 0) << 24 >>> 24)));
		return ($bytesToString($subslice(new sliceType(buf), i)));
	};
	mmapper.ptr.prototype.Mmap = function(fd, offset, length, prot, flags) {
		var _key, _r, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tuple, addr, b, data, err, errno, fd, flags, length, m, offset, p, prot, sl, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _key = $f._key; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; _tmp$4 = $f._tmp$4; _tmp$5 = $f._tmp$5; _tuple = $f._tuple; addr = $f.addr; b = $f.b; data = $f.data; err = $f.err; errno = $f.errno; fd = $f.fd; flags = $f.flags; length = $f.length; m = $f.m; offset = $f.offset; p = $f.p; prot = $f.prot; sl = $f.sl; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		sl = [sl];
		data = sliceType.nil;
		err = $ifaceNil;
		m = this;
		if (length <= 0) {
			_tmp = sliceType.nil;
			_tmp$1 = new Errno(22);
			data = _tmp;
			err = _tmp$1;
			$s = -1; return [data, err];
		}
		_r = m.mmap(0, ((length >>> 0)), prot, flags, fd, offset); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		addr = _tuple[0];
		errno = _tuple[1];
		if (!($interfaceIsEqual(errno, $ifaceNil))) {
			_tmp$2 = sliceType.nil;
			_tmp$3 = errno;
			data = _tmp$2;
			err = _tmp$3;
			$s = -1; return [data, err];
		}
		sl[0] = new structType.ptr(addr, length, length);
		b = sl[0];
		p = $indexPtr(b.$array, b.$offset + (b.$capacity - 1 >> 0), ptrType$2);
		$r = m.Mutex.Lock(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$deferred.push([$methodVal(m.Mutex, "Unlock"), []]);
		_key = p; (m.active || $throwRuntimeError("assignment to entry in nil map"))[ptrType$2.keyFor(_key)] = { k: _key, v: b };
		_tmp$4 = b;
		_tmp$5 = $ifaceNil;
		data = _tmp$4;
		err = _tmp$5;
		$s = -1; return [data, err];
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  [data, err]; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: mmapper.ptr.prototype.Mmap }; } $f._key = _key; $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f._tmp$4 = _tmp$4; $f._tmp$5 = _tmp$5; $f._tuple = _tuple; $f.addr = addr; $f.b = b; $f.data = data; $f.err = err; $f.errno = errno; $f.fd = fd; $f.flags = flags; $f.length = length; $f.m = m; $f.offset = offset; $f.p = p; $f.prot = prot; $f.sl = sl; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	mmapper.prototype.Mmap = function(fd, offset, length, prot, flags) { return this.$val.Mmap(fd, offset, length, prot, flags); };
	mmapper.ptr.prototype.Munmap = function(data) {
		var _entry, _r, b, data, err, errno, m, p, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _r = $f._r; b = $f.b; data = $f.data; err = $f.err; errno = $f.errno; m = $f.m; p = $f.p; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		err = $ifaceNil;
		m = this;
		if ((data.$length === 0) || !((data.$length === data.$capacity))) {
			err = new Errno(22);
			$s = -1; return err;
		}
		p = $indexPtr(data.$array, data.$offset + (data.$capacity - 1 >> 0), ptrType$2);
		$r = m.Mutex.Lock(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$deferred.push([$methodVal(m.Mutex, "Unlock"), []]);
		b = (_entry = m.active[ptrType$2.keyFor(p)], _entry !== undefined ? _entry.v : sliceType.nil);
		if (b === sliceType.nil || !($indexPtr(b.$array, b.$offset + 0, ptrType$2) === $indexPtr(data.$array, data.$offset + 0, ptrType$2))) {
			err = new Errno(22);
			$s = -1; return err;
		}
		_r = m.munmap((($sliceToArray(b))), ((b.$length >>> 0))); /* */ $s = 2; case 2: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		errno = _r;
		if (!($interfaceIsEqual(errno, $ifaceNil))) {
			err = errno;
			$s = -1; return err;
		}
		delete m.active[ptrType$2.keyFor(p)];
		err = $ifaceNil;
		$s = -1; return err;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  err; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: mmapper.ptr.prototype.Munmap }; } $f._entry = _entry; $f._r = _r; $f.b = b; $f.data = data; $f.err = err; $f.errno = errno; $f.m = m; $f.p = p; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	mmapper.prototype.Munmap = function(data) { return this.$val.Munmap(data); };
	Errno.prototype.Error = function() {
		var e, s;
		e = this.$val;
		if (0 <= ((e >> 0)) && ((e >> 0)) < 133) {
			s = ((e < 0 || e >= errors.length) ? ($throwRuntimeError("index out of range"), undefined) : errors[e]);
			if (!(s === "")) {
				return s;
			}
		}
		return "errno " + itoa(((e >> 0)));
	};
	$ptrType(Errno).prototype.Error = function() { return new Errno(this.$get()).Error(); };
	Errno.prototype.Temporary = function() {
		var e;
		e = this.$val;
		return (e === 4) || (e === 24) || new Errno(e).Timeout();
	};
	$ptrType(Errno).prototype.Temporary = function() { return new Errno(this.$get()).Temporary(); };
	Errno.prototype.Timeout = function() {
		var e;
		e = this.$val;
		return (e === 11) || (e === 11) || (e === 110);
	};
	$ptrType(Errno).prototype.Timeout = function() { return new Errno(this.$get()).Timeout(); };
	errnoErr = function(e) {
		var _1, e;
		_1 = e;
		if (_1 === (0)) {
			return $ifaceNil;
		} else if (_1 === (11)) {
			return errEAGAIN;
		} else if (_1 === (22)) {
			return errEINVAL;
		} else if (_1 === (2)) {
			return errENOENT;
		}
		return new Errno(e);
	};
	munmap = function(addr, length) {
		var _tuple, addr, e1, err, length;
		err = $ifaceNil;
		_tuple = Syscall(11, (addr), (length), 0);
		e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = errnoErr(e1);
		}
		return err;
	};
	mmap = function(addr, length, prot, flags, fd, offset) {
		var _tuple, addr, e1, err, fd, flags, length, offset, prot, r0, xaddr;
		xaddr = 0;
		err = $ifaceNil;
		_tuple = Syscall6(9, (addr), (length), ((prot >>> 0)), ((flags >>> 0)), ((fd >>> 0)), ((offset.$low >>> 0)));
		r0 = _tuple[0];
		e1 = _tuple[2];
		xaddr = (r0);
		if (!((e1 === 0))) {
			err = errnoErr(e1);
		}
		return [xaddr, err];
	};
	ptrType$26.methods = [{prop: "Mmap", name: "Mmap", pkg: "", typ: $funcType([$Int, $Int64, $Int, $Int, $Int], [sliceType, $error], false)}, {prop: "Munmap", name: "Munmap", pkg: "", typ: $funcType([sliceType], [$error], false)}];
	Errno.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Temporary", name: "Temporary", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Timeout", name: "Timeout", pkg: "", typ: $funcType([], [$Bool], false)}];
	mmapper.init("syscall", [{prop: "Mutex", name: "Mutex", embedded: true, exported: true, typ: sync.Mutex, tag: ""}, {prop: "active", name: "active", embedded: false, exported: false, typ: mapType, tag: ""}, {prop: "mmap", name: "mmap", embedded: false, exported: false, typ: funcType$2, tag: ""}, {prop: "munmap", name: "munmap", embedded: false, exported: false, typ: funcType$3, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = race.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = runtime.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = sync.$init(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		lineBuffer = sliceType.nil;
		syscallModule = null;
		warningPrinted = false;
		alreadyTriedToLoad = false;
		minusOne = -1;
		envs = runtime_envs();
		errEAGAIN = new Errno(11);
		errEINVAL = new Errno(22);
		errENOENT = new Errno(2);
		errors = $toNativeArray($kindString, ["", "operation not permitted", "no such file or directory", "no such process", "interrupted system call", "input/output error", "no such device or address", "argument list too long", "exec format error", "bad file descriptor", "no child processes", "resource temporarily unavailable", "cannot allocate memory", "permission denied", "bad address", "block device required", "device or resource busy", "file exists", "invalid cross-device link", "no such device", "not a directory", "is a directory", "invalid argument", "too many open files in system", "too many open files", "inappropriate ioctl for device", "text file busy", "file too large", "no space left on device", "illegal seek", "read-only file system", "too many links", "broken pipe", "numerical argument out of domain", "numerical result out of range", "resource deadlock avoided", "file name too long", "no locks available", "function not implemented", "directory not empty", "too many levels of symbolic links", "", "no message of desired type", "identifier removed", "channel number out of range", "level 2 not synchronized", "level 3 halted", "level 3 reset", "link number out of range", "protocol driver not attached", "no CSI structure available", "level 2 halted", "invalid exchange", "invalid request descriptor", "exchange full", "no anode", "invalid request code", "invalid slot", "", "bad font file format", "device not a stream", "no data available", "timer expired", "out of streams resources", "machine is not on the network", "package not installed", "object is remote", "link has been severed", "advertise error", "srmount error", "communication error on send", "protocol error", "multihop attempted", "RFS specific error", "bad message", "value too large for defined data type", "name not unique on network", "file descriptor in bad state", "remote address changed", "can not access a needed shared library", "accessing a corrupted shared library", ".lib section in a.out corrupted", "attempting to link in too many shared libraries", "cannot exec a shared library directly", "invalid or incomplete multibyte or wide character", "interrupted system call should be restarted", "streams pipe error", "too many users", "socket operation on non-socket", "destination address required", "message too long", "protocol wrong type for socket", "protocol not available", "protocol not supported", "socket type not supported", "operation not supported", "protocol family not supported", "address family not supported by protocol", "address already in use", "cannot assign requested address", "network is down", "network is unreachable", "network dropped connection on reset", "software caused connection abort", "connection reset by peer", "no buffer space available", "transport endpoint is already connected", "transport endpoint is not connected", "cannot send after transport endpoint shutdown", "too many references: cannot splice", "connection timed out", "connection refused", "host is down", "no route to host", "operation already in progress", "operation now in progress", "stale NFS file handle", "structure needs cleaning", "not a XENIX named type file", "no XENIX semaphores available", "is a named type file", "remote I/O error", "disk quota exceeded", "no medium found", "wrong medium type", "operation canceled", "required key not available", "key has expired", "key has been revoked", "key was rejected by service", "owner died", "state not recoverable", "operation not possible due to RF-kill"]);
		mapper = new mmapper.ptr(new sync.Mutex.ptr(0, 0), {}, mmap, munmap);
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["time"] = (function() {
	var $pkg = {}, $init, errors, js, nosync, runtime, syscall, ParseError, Time, Month, Weekday, Duration, Location, zone, zoneTrans, sliceType, sliceType$1, ptrType, sliceType$2, arrayType, sliceType$3, arrayType$1, arrayType$2, ptrType$2, arrayType$3, ptrType$4, ptrType$7, zoneSources, std0x, longDayNames, shortDayNames, shortMonthNames, longMonthNames, atoiError, errBad, errLeadingInt, months, days, daysBefore, startNano, utcLoc, utcLoc$24ptr, localLoc, localLoc$24ptr, localOnce, errLocation, badData, x, init, initLocal, runtimeNano, indexByte, startsWithLowerCase, nextStdChunk, match, lookup, appendInt, atoi, formatNano, quote, isDigit, getnum, cutspace, skip, Parse, parse, parseTimeZone, parseGMT, parseSignedOffset, parseNanoseconds, leadingInt, absWeekday, absClock, fmtFrac, fmtInt, lessThanHalf, absDate, daysIn, unixTime, Unix, isLeap, norm, Date, div, FixedZone;
	errors = $packages["errors"];
	js = $packages["github.com/gopherjs/gopherjs/js"];
	nosync = $packages["github.com/gopherjs/gopherjs/nosync"];
	runtime = $packages["runtime"];
	syscall = $packages["syscall"];
	ParseError = $pkg.ParseError = $newType(0, $kindStruct, "time.ParseError", true, "time", true, function(Layout_, Value_, LayoutElem_, ValueElem_, Message_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Layout = "";
			this.Value = "";
			this.LayoutElem = "";
			this.ValueElem = "";
			this.Message = "";
			return;
		}
		this.Layout = Layout_;
		this.Value = Value_;
		this.LayoutElem = LayoutElem_;
		this.ValueElem = ValueElem_;
		this.Message = Message_;
	});
	Time = $pkg.Time = $newType(0, $kindStruct, "time.Time", true, "time", true, function(wall_, ext_, loc_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.wall = new $Uint64(0, 0);
			this.ext = new $Int64(0, 0);
			this.loc = ptrType$2.nil;
			return;
		}
		this.wall = wall_;
		this.ext = ext_;
		this.loc = loc_;
	});
	Month = $pkg.Month = $newType(4, $kindInt, "time.Month", true, "time", true, null);
	Weekday = $pkg.Weekday = $newType(4, $kindInt, "time.Weekday", true, "time", true, null);
	Duration = $pkg.Duration = $newType(8, $kindInt64, "time.Duration", true, "time", true, null);
	Location = $pkg.Location = $newType(0, $kindStruct, "time.Location", true, "time", true, function(name_, zone_, tx_, cacheStart_, cacheEnd_, cacheZone_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.name = "";
			this.zone = sliceType.nil;
			this.tx = sliceType$1.nil;
			this.cacheStart = new $Int64(0, 0);
			this.cacheEnd = new $Int64(0, 0);
			this.cacheZone = ptrType.nil;
			return;
		}
		this.name = name_;
		this.zone = zone_;
		this.tx = tx_;
		this.cacheStart = cacheStart_;
		this.cacheEnd = cacheEnd_;
		this.cacheZone = cacheZone_;
	});
	zone = $pkg.zone = $newType(0, $kindStruct, "time.zone", true, "time", false, function(name_, offset_, isDST_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.name = "";
			this.offset = 0;
			this.isDST = false;
			return;
		}
		this.name = name_;
		this.offset = offset_;
		this.isDST = isDST_;
	});
	zoneTrans = $pkg.zoneTrans = $newType(0, $kindStruct, "time.zoneTrans", true, "time", false, function(when_, index_, isstd_, isutc_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.when = new $Int64(0, 0);
			this.index = 0;
			this.isstd = false;
			this.isutc = false;
			return;
		}
		this.when = when_;
		this.index = index_;
		this.isstd = isstd_;
		this.isutc = isutc_;
	});
	sliceType = $sliceType(zone);
	sliceType$1 = $sliceType(zoneTrans);
	ptrType = $ptrType(zone);
	sliceType$2 = $sliceType($String);
	arrayType = $arrayType($Uint8, 20);
	sliceType$3 = $sliceType($Uint8);
	arrayType$1 = $arrayType($Uint8, 9);
	arrayType$2 = $arrayType($Uint8, 64);
	ptrType$2 = $ptrType(Location);
	arrayType$3 = $arrayType($Uint8, 32);
	ptrType$4 = $ptrType(ParseError);
	ptrType$7 = $ptrType(Time);
	init = function() {
		$unused(Unix(new $Int64(0, 0), new $Int64(0, 0)));
	};
	initLocal = function() {
		var d, i, j, s;
		d = new ($global.Date)();
		s = $internalize(d, $String);
		i = indexByte(s, 40);
		j = indexByte(s, 41);
		if ((i === -1) || (j === -1)) {
			localLoc.name = "UTC";
			return;
		}
		localLoc.name = $substring(s, (i + 1 >> 0), j);
		localLoc.zone = new sliceType([new zone.ptr(localLoc.name, $imul(($parseInt(d.getTimezoneOffset()) >> 0), -60), false)]);
	};
	runtimeNano = function() {
		return $mul64($internalize(new ($global.Date)().getTime(), $Int64), new $Int64(0, 1000000));
	};
	indexByte = function(s, c) {
		var c, s;
		return $parseInt(s.indexOf($global.String.fromCharCode(c))) >> 0;
	};
	startsWithLowerCase = function(str) {
		var c, str;
		if (str.length === 0) {
			return false;
		}
		c = str.charCodeAt(0);
		return 97 <= c && c <= 122;
	};
	nextStdChunk = function(layout) {
		var _1, _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$18, _tmp$19, _tmp$2, _tmp$20, _tmp$21, _tmp$22, _tmp$23, _tmp$24, _tmp$25, _tmp$26, _tmp$27, _tmp$28, _tmp$29, _tmp$3, _tmp$30, _tmp$31, _tmp$32, _tmp$33, _tmp$34, _tmp$35, _tmp$36, _tmp$37, _tmp$38, _tmp$39, _tmp$4, _tmp$40, _tmp$41, _tmp$42, _tmp$43, _tmp$44, _tmp$45, _tmp$46, _tmp$47, _tmp$48, _tmp$49, _tmp$5, _tmp$50, _tmp$51, _tmp$52, _tmp$53, _tmp$54, _tmp$55, _tmp$56, _tmp$57, _tmp$58, _tmp$59, _tmp$6, _tmp$60, _tmp$61, _tmp$62, _tmp$63, _tmp$64, _tmp$65, _tmp$66, _tmp$67, _tmp$68, _tmp$69, _tmp$7, _tmp$70, _tmp$71, _tmp$72, _tmp$73, _tmp$74, _tmp$75, _tmp$76, _tmp$77, _tmp$78, _tmp$79, _tmp$8, _tmp$80, _tmp$81, _tmp$82, _tmp$83, _tmp$84, _tmp$85, _tmp$86, _tmp$9, c, ch, i, j, layout, prefix, std, std$1, suffix, x$1;
		prefix = "";
		std = 0;
		suffix = "";
		i = 0;
		while (true) {
			if (!(i < layout.length)) { break; }
			c = ((layout.charCodeAt(i) >> 0));
			_1 = c;
			if (_1 === (74)) {
				if (layout.length >= (i + 3 >> 0) && $substring(layout, i, (i + 3 >> 0)) === "Jan") {
					if (layout.length >= (i + 7 >> 0) && $substring(layout, i, (i + 7 >> 0)) === "January") {
						_tmp = $substring(layout, 0, i);
						_tmp$1 = 257;
						_tmp$2 = $substring(layout, (i + 7 >> 0));
						prefix = _tmp;
						std = _tmp$1;
						suffix = _tmp$2;
						return [prefix, std, suffix];
					}
					if (!startsWithLowerCase($substring(layout, (i + 3 >> 0)))) {
						_tmp$3 = $substring(layout, 0, i);
						_tmp$4 = 258;
						_tmp$5 = $substring(layout, (i + 3 >> 0));
						prefix = _tmp$3;
						std = _tmp$4;
						suffix = _tmp$5;
						return [prefix, std, suffix];
					}
				}
			} else if (_1 === (77)) {
				if (layout.length >= (i + 3 >> 0)) {
					if ($substring(layout, i, (i + 3 >> 0)) === "Mon") {
						if (layout.length >= (i + 6 >> 0) && $substring(layout, i, (i + 6 >> 0)) === "Monday") {
							_tmp$6 = $substring(layout, 0, i);
							_tmp$7 = 261;
							_tmp$8 = $substring(layout, (i + 6 >> 0));
							prefix = _tmp$6;
							std = _tmp$7;
							suffix = _tmp$8;
							return [prefix, std, suffix];
						}
						if (!startsWithLowerCase($substring(layout, (i + 3 >> 0)))) {
							_tmp$9 = $substring(layout, 0, i);
							_tmp$10 = 262;
							_tmp$11 = $substring(layout, (i + 3 >> 0));
							prefix = _tmp$9;
							std = _tmp$10;
							suffix = _tmp$11;
							return [prefix, std, suffix];
						}
					}
					if ($substring(layout, i, (i + 3 >> 0)) === "MST") {
						_tmp$12 = $substring(layout, 0, i);
						_tmp$13 = 21;
						_tmp$14 = $substring(layout, (i + 3 >> 0));
						prefix = _tmp$12;
						std = _tmp$13;
						suffix = _tmp$14;
						return [prefix, std, suffix];
					}
				}
			} else if (_1 === (48)) {
				if (layout.length >= (i + 2 >> 0) && 49 <= layout.charCodeAt((i + 1 >> 0)) && layout.charCodeAt((i + 1 >> 0)) <= 54) {
					_tmp$15 = $substring(layout, 0, i);
					_tmp$16 = (x$1 = layout.charCodeAt((i + 1 >> 0)) - 49 << 24 >>> 24, ((x$1 < 0 || x$1 >= std0x.length) ? ($throwRuntimeError("index out of range"), undefined) : std0x[x$1]));
					_tmp$17 = $substring(layout, (i + 2 >> 0));
					prefix = _tmp$15;
					std = _tmp$16;
					suffix = _tmp$17;
					return [prefix, std, suffix];
				}
			} else if (_1 === (49)) {
				if (layout.length >= (i + 2 >> 0) && (layout.charCodeAt((i + 1 >> 0)) === 53)) {
					_tmp$18 = $substring(layout, 0, i);
					_tmp$19 = 522;
					_tmp$20 = $substring(layout, (i + 2 >> 0));
					prefix = _tmp$18;
					std = _tmp$19;
					suffix = _tmp$20;
					return [prefix, std, suffix];
				}
				_tmp$21 = $substring(layout, 0, i);
				_tmp$22 = 259;
				_tmp$23 = $substring(layout, (i + 1 >> 0));
				prefix = _tmp$21;
				std = _tmp$22;
				suffix = _tmp$23;
				return [prefix, std, suffix];
			} else if (_1 === (50)) {
				if (layout.length >= (i + 4 >> 0) && $substring(layout, i, (i + 4 >> 0)) === "2006") {
					_tmp$24 = $substring(layout, 0, i);
					_tmp$25 = 273;
					_tmp$26 = $substring(layout, (i + 4 >> 0));
					prefix = _tmp$24;
					std = _tmp$25;
					suffix = _tmp$26;
					return [prefix, std, suffix];
				}
				_tmp$27 = $substring(layout, 0, i);
				_tmp$28 = 263;
				_tmp$29 = $substring(layout, (i + 1 >> 0));
				prefix = _tmp$27;
				std = _tmp$28;
				suffix = _tmp$29;
				return [prefix, std, suffix];
			} else if (_1 === (95)) {
				if (layout.length >= (i + 2 >> 0) && (layout.charCodeAt((i + 1 >> 0)) === 50)) {
					if (layout.length >= (i + 5 >> 0) && $substring(layout, (i + 1 >> 0), (i + 5 >> 0)) === "2006") {
						_tmp$30 = $substring(layout, 0, (i + 1 >> 0));
						_tmp$31 = 273;
						_tmp$32 = $substring(layout, (i + 5 >> 0));
						prefix = _tmp$30;
						std = _tmp$31;
						suffix = _tmp$32;
						return [prefix, std, suffix];
					}
					_tmp$33 = $substring(layout, 0, i);
					_tmp$34 = 264;
					_tmp$35 = $substring(layout, (i + 2 >> 0));
					prefix = _tmp$33;
					std = _tmp$34;
					suffix = _tmp$35;
					return [prefix, std, suffix];
				}
			} else if (_1 === (51)) {
				_tmp$36 = $substring(layout, 0, i);
				_tmp$37 = 523;
				_tmp$38 = $substring(layout, (i + 1 >> 0));
				prefix = _tmp$36;
				std = _tmp$37;
				suffix = _tmp$38;
				return [prefix, std, suffix];
			} else if (_1 === (52)) {
				_tmp$39 = $substring(layout, 0, i);
				_tmp$40 = 525;
				_tmp$41 = $substring(layout, (i + 1 >> 0));
				prefix = _tmp$39;
				std = _tmp$40;
				suffix = _tmp$41;
				return [prefix, std, suffix];
			} else if (_1 === (53)) {
				_tmp$42 = $substring(layout, 0, i);
				_tmp$43 = 527;
				_tmp$44 = $substring(layout, (i + 1 >> 0));
				prefix = _tmp$42;
				std = _tmp$43;
				suffix = _tmp$44;
				return [prefix, std, suffix];
			} else if (_1 === (80)) {
				if (layout.length >= (i + 2 >> 0) && (layout.charCodeAt((i + 1 >> 0)) === 77)) {
					_tmp$45 = $substring(layout, 0, i);
					_tmp$46 = 531;
					_tmp$47 = $substring(layout, (i + 2 >> 0));
					prefix = _tmp$45;
					std = _tmp$46;
					suffix = _tmp$47;
					return [prefix, std, suffix];
				}
			} else if (_1 === (112)) {
				if (layout.length >= (i + 2 >> 0) && (layout.charCodeAt((i + 1 >> 0)) === 109)) {
					_tmp$48 = $substring(layout, 0, i);
					_tmp$49 = 532;
					_tmp$50 = $substring(layout, (i + 2 >> 0));
					prefix = _tmp$48;
					std = _tmp$49;
					suffix = _tmp$50;
					return [prefix, std, suffix];
				}
			} else if (_1 === (45)) {
				if (layout.length >= (i + 7 >> 0) && $substring(layout, i, (i + 7 >> 0)) === "-070000") {
					_tmp$51 = $substring(layout, 0, i);
					_tmp$52 = 28;
					_tmp$53 = $substring(layout, (i + 7 >> 0));
					prefix = _tmp$51;
					std = _tmp$52;
					suffix = _tmp$53;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 9 >> 0) && $substring(layout, i, (i + 9 >> 0)) === "-07:00:00") {
					_tmp$54 = $substring(layout, 0, i);
					_tmp$55 = 31;
					_tmp$56 = $substring(layout, (i + 9 >> 0));
					prefix = _tmp$54;
					std = _tmp$55;
					suffix = _tmp$56;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 5 >> 0) && $substring(layout, i, (i + 5 >> 0)) === "-0700") {
					_tmp$57 = $substring(layout, 0, i);
					_tmp$58 = 27;
					_tmp$59 = $substring(layout, (i + 5 >> 0));
					prefix = _tmp$57;
					std = _tmp$58;
					suffix = _tmp$59;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 6 >> 0) && $substring(layout, i, (i + 6 >> 0)) === "-07:00") {
					_tmp$60 = $substring(layout, 0, i);
					_tmp$61 = 30;
					_tmp$62 = $substring(layout, (i + 6 >> 0));
					prefix = _tmp$60;
					std = _tmp$61;
					suffix = _tmp$62;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 3 >> 0) && $substring(layout, i, (i + 3 >> 0)) === "-07") {
					_tmp$63 = $substring(layout, 0, i);
					_tmp$64 = 29;
					_tmp$65 = $substring(layout, (i + 3 >> 0));
					prefix = _tmp$63;
					std = _tmp$64;
					suffix = _tmp$65;
					return [prefix, std, suffix];
				}
			} else if (_1 === (90)) {
				if (layout.length >= (i + 7 >> 0) && $substring(layout, i, (i + 7 >> 0)) === "Z070000") {
					_tmp$66 = $substring(layout, 0, i);
					_tmp$67 = 23;
					_tmp$68 = $substring(layout, (i + 7 >> 0));
					prefix = _tmp$66;
					std = _tmp$67;
					suffix = _tmp$68;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 9 >> 0) && $substring(layout, i, (i + 9 >> 0)) === "Z07:00:00") {
					_tmp$69 = $substring(layout, 0, i);
					_tmp$70 = 26;
					_tmp$71 = $substring(layout, (i + 9 >> 0));
					prefix = _tmp$69;
					std = _tmp$70;
					suffix = _tmp$71;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 5 >> 0) && $substring(layout, i, (i + 5 >> 0)) === "Z0700") {
					_tmp$72 = $substring(layout, 0, i);
					_tmp$73 = 22;
					_tmp$74 = $substring(layout, (i + 5 >> 0));
					prefix = _tmp$72;
					std = _tmp$73;
					suffix = _tmp$74;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 6 >> 0) && $substring(layout, i, (i + 6 >> 0)) === "Z07:00") {
					_tmp$75 = $substring(layout, 0, i);
					_tmp$76 = 25;
					_tmp$77 = $substring(layout, (i + 6 >> 0));
					prefix = _tmp$75;
					std = _tmp$76;
					suffix = _tmp$77;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 3 >> 0) && $substring(layout, i, (i + 3 >> 0)) === "Z07") {
					_tmp$78 = $substring(layout, 0, i);
					_tmp$79 = 24;
					_tmp$80 = $substring(layout, (i + 3 >> 0));
					prefix = _tmp$78;
					std = _tmp$79;
					suffix = _tmp$80;
					return [prefix, std, suffix];
				}
			} else if (_1 === (46)) {
				if ((i + 1 >> 0) < layout.length && ((layout.charCodeAt((i + 1 >> 0)) === 48) || (layout.charCodeAt((i + 1 >> 0)) === 57))) {
					ch = layout.charCodeAt((i + 1 >> 0));
					j = i + 1 >> 0;
					while (true) {
						if (!(j < layout.length && (layout.charCodeAt(j) === ch))) { break; }
						j = j + (1) >> 0;
					}
					if (!isDigit(layout, j)) {
						std$1 = 32;
						if (layout.charCodeAt((i + 1 >> 0)) === 57) {
							std$1 = 33;
						}
						std$1 = std$1 | ((((j - ((i + 1 >> 0)) >> 0)) << 16 >> 0));
						_tmp$81 = $substring(layout, 0, i);
						_tmp$82 = std$1;
						_tmp$83 = $substring(layout, j);
						prefix = _tmp$81;
						std = _tmp$82;
						suffix = _tmp$83;
						return [prefix, std, suffix];
					}
				}
			}
			i = i + (1) >> 0;
		}
		_tmp$84 = layout;
		_tmp$85 = 0;
		_tmp$86 = "";
		prefix = _tmp$84;
		std = _tmp$85;
		suffix = _tmp$86;
		return [prefix, std, suffix];
	};
	match = function(s1, s2) {
		var c1, c2, i, s1, s2;
		i = 0;
		while (true) {
			if (!(i < s1.length)) { break; }
			c1 = s1.charCodeAt(i);
			c2 = s2.charCodeAt(i);
			if (!((c1 === c2))) {
				c1 = (c1 | (32)) >>> 0;
				c2 = (c2 | (32)) >>> 0;
				if (!((c1 === c2)) || c1 < 97 || c1 > 122) {
					return false;
				}
			}
			i = i + (1) >> 0;
		}
		return true;
	};
	lookup = function(tab, val) {
		var _i, _ref, i, tab, v, val;
		_ref = tab;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			v = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			if (val.length >= v.length && match($substring(val, 0, v.length), v)) {
				return [i, $substring(val, v.length), $ifaceNil];
			}
			_i++;
		}
		return [-1, val, errBad];
	};
	appendInt = function(b, x$1, width) {
		var _q, b, buf, i, q, u, w, width, x$1;
		u = ((x$1 >>> 0));
		if (x$1 < 0) {
			b = $append(b, 45);
			u = ((-x$1 >>> 0));
		}
		buf = arrayType.zero();
		i = 20;
		while (true) {
			if (!(u >= 10)) { break; }
			i = i - (1) >> 0;
			q = (_q = u / 10, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
			((i < 0 || i >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[i] = ((((48 + u >>> 0) - (q * 10 >>> 0) >>> 0) << 24 >>> 24)));
			u = q;
		}
		i = i - (1) >> 0;
		((i < 0 || i >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[i] = (((48 + u >>> 0) << 24 >>> 24)));
		w = 20 - i >> 0;
		while (true) {
			if (!(w < width)) { break; }
			b = $append(b, 48);
			w = w + (1) >> 0;
		}
		return $appendSlice(b, $subslice(new sliceType$3(buf), i));
	};
	atoi = function(s) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tuple, err, neg, q, rem, s, x$1;
		x$1 = 0;
		err = $ifaceNil;
		neg = false;
		if (!(s === "") && ((s.charCodeAt(0) === 45) || (s.charCodeAt(0) === 43))) {
			neg = s.charCodeAt(0) === 45;
			s = $substring(s, 1);
		}
		_tuple = leadingInt(s);
		q = _tuple[0];
		rem = _tuple[1];
		err = _tuple[2];
		x$1 = (((q.$low + ((q.$high >> 31) * 4294967296)) >> 0));
		if (!($interfaceIsEqual(err, $ifaceNil)) || !(rem === "")) {
			_tmp = 0;
			_tmp$1 = atoiError;
			x$1 = _tmp;
			err = _tmp$1;
			return [x$1, err];
		}
		if (neg) {
			x$1 = -x$1;
		}
		_tmp$2 = x$1;
		_tmp$3 = $ifaceNil;
		x$1 = _tmp$2;
		err = _tmp$3;
		return [x$1, err];
	};
	formatNano = function(b, nanosec, n, trim) {
		var _q, _r, b, buf, n, nanosec, start, trim, u, x$1;
		u = nanosec;
		buf = arrayType$1.zero();
		start = 9;
		while (true) {
			if (!(start > 0)) { break; }
			start = start - (1) >> 0;
			((start < 0 || start >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[start] = ((((_r = u % 10, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) + 48 >>> 0) << 24 >>> 24)));
			u = (_q = u / (10), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
		}
		if (n > 9) {
			n = 9;
		}
		if (trim) {
			while (true) {
				if (!(n > 0 && ((x$1 = n - 1 >> 0, ((x$1 < 0 || x$1 >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[x$1])) === 48))) { break; }
				n = n - (1) >> 0;
			}
			if (n === 0) {
				return b;
			}
		}
		b = $append(b, 46);
		return $appendSlice(b, $subslice(new sliceType$3(buf), 0, n));
	};
	Time.ptr.prototype.String = function() {
		var _r, _tmp, _tmp$1, _tmp$2, _tmp$3, buf, m0, m1, m2, s, sign, t, wid, x$1, x$2, x$3, x$4, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; buf = $f.buf; m0 = $f.m0; m1 = $f.m1; m2 = $f.m2; s = $f.s; sign = $f.sign; t = $f.t; wid = $f.wid; x$1 = $f.x$1; x$2 = $f.x$2; x$3 = $f.x$3; x$4 = $f.x$4; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).Format("2006-01-02 15:04:05.999999999 -0700 MST"); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		s = _r;
		if (!((x$1 = (x$2 = t.wall, new $Uint64(x$2.$high & 2147483648, (x$2.$low & 0) >>> 0)), (x$1.$high === 0 && x$1.$low === 0)))) {
			m2 = ((x$3 = t.ext, new $Uint64(x$3.$high, x$3.$low)));
			sign = 43;
			if ((x$4 = t.ext, (x$4.$high < 0 || (x$4.$high === 0 && x$4.$low < 0)))) {
				sign = 45;
				m2 = new $Uint64(-m2.$high, -m2.$low);
			}
			_tmp = $div64(m2, new $Uint64(0, 1000000000), false);
			_tmp$1 = $div64(m2, new $Uint64(0, 1000000000), true);
			m1 = _tmp;
			m2 = _tmp$1;
			_tmp$2 = $div64(m1, new $Uint64(0, 1000000000), false);
			_tmp$3 = $div64(m1, new $Uint64(0, 1000000000), true);
			m0 = _tmp$2;
			m1 = _tmp$3;
			buf = sliceType$3.nil;
			buf = $appendSlice(buf, " m=");
			buf = $append(buf, sign);
			wid = 0;
			if (!((m0.$high === 0 && m0.$low === 0))) {
				buf = appendInt(buf, ((m0.$low >> 0)), 0);
				wid = 9;
			}
			buf = appendInt(buf, ((m1.$low >> 0)), wid);
			buf = $append(buf, 46);
			buf = appendInt(buf, ((m2.$low >> 0)), 9);
			s = s + (($bytesToString(buf)));
		}
		$s = -1; return s;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.String }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f.buf = buf; $f.m0 = m0; $f.m1 = m1; $f.m2 = m2; $f.s = s; $f.sign = sign; $f.t = t; $f.wid = wid; $f.x$1 = x$1; $f.x$2 = x$2; $f.x$3 = x$3; $f.x$4 = x$4; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.String = function() { return this.$val.String(); };
	Time.ptr.prototype.Format = function(layout) {
		var _r, b, buf, layout, max, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; b = $f.b; buf = $f.buf; layout = $f.layout; max = $f.max; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		b = sliceType$3.nil;
		max = layout.length + 10 >> 0;
		if (max < 64) {
			buf = arrayType$2.zero();
			b = $subslice(new sliceType$3(buf), 0, 0);
		} else {
			b = $makeSlice(sliceType$3, 0, max);
		}
		_r = $clone(t, Time).AppendFormat(b, layout); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		b = _r;
		$s = -1; return ($bytesToString(b));
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.Format }; } $f._r = _r; $f.b = b; $f.buf = buf; $f.layout = layout; $f.max = max; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.Format = function(layout) { return this.$val.Format(layout); };
	Time.ptr.prototype.AppendFormat = function(b, layout) {
		var _1, _q, _q$1, _q$2, _q$3, _r, _r$1, _r$2, _r$3, _r$4, _r$5, _r$6, _tuple, _tuple$1, _tuple$2, _tuple$3, abs, absoffset, b, day, hour, hr, hr$1, layout, m, min, month, name, offset, prefix, s, sec, std, suffix, t, y, year, zone$1, zone$2, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _1 = $f._1; _q = $f._q; _q$1 = $f._q$1; _q$2 = $f._q$2; _q$3 = $f._q$3; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _r$5 = $f._r$5; _r$6 = $f._r$6; _tuple = $f._tuple; _tuple$1 = $f._tuple$1; _tuple$2 = $f._tuple$2; _tuple$3 = $f._tuple$3; abs = $f.abs; absoffset = $f.absoffset; b = $f.b; day = $f.day; hour = $f.hour; hr = $f.hr; hr$1 = $f.hr$1; layout = $f.layout; m = $f.m; min = $f.min; month = $f.month; name = $f.name; offset = $f.offset; prefix = $f.prefix; s = $f.s; sec = $f.sec; std = $f.std; suffix = $f.suffix; t = $f.t; y = $f.y; year = $f.year; zone$1 = $f.zone$1; zone$2 = $f.zone$2; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).locabs(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		name = _tuple[0];
		offset = _tuple[1];
		abs = _tuple[2];
		year = -1;
		month = 0;
		day = 0;
		hour = -1;
		min = 0;
		sec = 0;
		while (true) {
			if (!(!(layout === ""))) { break; }
			_tuple$1 = nextStdChunk(layout);
			prefix = _tuple$1[0];
			std = _tuple$1[1];
			suffix = _tuple$1[2];
			if (!(prefix === "")) {
				b = $appendSlice(b, prefix);
			}
			if (std === 0) {
				break;
			}
			layout = suffix;
			if (year < 0 && !(((std & 256) === 0))) {
				_tuple$2 = absDate(abs, true);
				year = _tuple$2[0];
				month = _tuple$2[1];
				day = _tuple$2[2];
			}
			if (hour < 0 && !(((std & 512) === 0))) {
				_tuple$3 = absClock(abs);
				hour = _tuple$3[0];
				min = _tuple$3[1];
				sec = _tuple$3[2];
			}
			switch (0) { default:
				_1 = std & 65535;
				if (_1 === (274)) {
					y = year;
					if (y < 0) {
						y = -y;
					}
					b = appendInt(b, (_r$1 = y % 100, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")), 2);
				} else if (_1 === (273)) {
					b = appendInt(b, year, 4);
				} else if (_1 === (258)) {
					b = $appendSlice(b, $substring(new Month(month).String(), 0, 3));
				} else if (_1 === (257)) {
					m = new Month(month).String();
					b = $appendSlice(b, m);
				} else if (_1 === (259)) {
					b = appendInt(b, ((month >> 0)), 0);
				} else if (_1 === (260)) {
					b = appendInt(b, ((month >> 0)), 2);
				} else if (_1 === (262)) {
					b = $appendSlice(b, $substring(new Weekday(absWeekday(abs)).String(), 0, 3));
				} else if (_1 === (261)) {
					s = new Weekday(absWeekday(abs)).String();
					b = $appendSlice(b, s);
				} else if (_1 === (263)) {
					b = appendInt(b, day, 0);
				} else if (_1 === (264)) {
					if (day < 10) {
						b = $append(b, 32);
					}
					b = appendInt(b, day, 0);
				} else if (_1 === (265)) {
					b = appendInt(b, day, 2);
				} else if (_1 === (522)) {
					b = appendInt(b, hour, 2);
				} else if (_1 === (523)) {
					hr = (_r$2 = hour % 12, _r$2 === _r$2 ? _r$2 : $throwRuntimeError("integer divide by zero"));
					if (hr === 0) {
						hr = 12;
					}
					b = appendInt(b, hr, 0);
				} else if (_1 === (524)) {
					hr$1 = (_r$3 = hour % 12, _r$3 === _r$3 ? _r$3 : $throwRuntimeError("integer divide by zero"));
					if (hr$1 === 0) {
						hr$1 = 12;
					}
					b = appendInt(b, hr$1, 2);
				} else if (_1 === (525)) {
					b = appendInt(b, min, 0);
				} else if (_1 === (526)) {
					b = appendInt(b, min, 2);
				} else if (_1 === (527)) {
					b = appendInt(b, sec, 0);
				} else if (_1 === (528)) {
					b = appendInt(b, sec, 2);
				} else if (_1 === (531)) {
					if (hour >= 12) {
						b = $appendSlice(b, "PM");
					} else {
						b = $appendSlice(b, "AM");
					}
				} else if (_1 === (532)) {
					if (hour >= 12) {
						b = $appendSlice(b, "pm");
					} else {
						b = $appendSlice(b, "am");
					}
				} else if ((_1 === (22)) || (_1 === (25)) || (_1 === (23)) || (_1 === (24)) || (_1 === (26)) || (_1 === (27)) || (_1 === (30)) || (_1 === (28)) || (_1 === (29)) || (_1 === (31))) {
					if ((offset === 0) && ((std === 22) || (std === 25) || (std === 23) || (std === 24) || (std === 26))) {
						b = $append(b, 90);
						break;
					}
					zone$1 = (_q = offset / 60, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
					absoffset = offset;
					if (zone$1 < 0) {
						b = $append(b, 45);
						zone$1 = -zone$1;
						absoffset = -absoffset;
					} else {
						b = $append(b, 43);
					}
					b = appendInt(b, (_q$1 = zone$1 / 60, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero")), 2);
					if ((std === 25) || (std === 30) || (std === 26) || (std === 31)) {
						b = $append(b, 58);
					}
					if (!((std === 29)) && !((std === 24))) {
						b = appendInt(b, (_r$4 = zone$1 % 60, _r$4 === _r$4 ? _r$4 : $throwRuntimeError("integer divide by zero")), 2);
					}
					if ((std === 23) || (std === 28) || (std === 31) || (std === 26)) {
						if ((std === 31) || (std === 26)) {
							b = $append(b, 58);
						}
						b = appendInt(b, (_r$5 = absoffset % 60, _r$5 === _r$5 ? _r$5 : $throwRuntimeError("integer divide by zero")), 2);
					}
				} else if (_1 === (21)) {
					if (!(name === "")) {
						b = $appendSlice(b, name);
						break;
					}
					zone$2 = (_q$2 = offset / 60, (_q$2 === _q$2 && _q$2 !== 1/0 && _q$2 !== -1/0) ? _q$2 >> 0 : $throwRuntimeError("integer divide by zero"));
					if (zone$2 < 0) {
						b = $append(b, 45);
						zone$2 = -zone$2;
					} else {
						b = $append(b, 43);
					}
					b = appendInt(b, (_q$3 = zone$2 / 60, (_q$3 === _q$3 && _q$3 !== 1/0 && _q$3 !== -1/0) ? _q$3 >> 0 : $throwRuntimeError("integer divide by zero")), 2);
					b = appendInt(b, (_r$6 = zone$2 % 60, _r$6 === _r$6 ? _r$6 : $throwRuntimeError("integer divide by zero")), 2);
				} else if ((_1 === (32)) || (_1 === (33))) {
					b = formatNano(b, (($clone(t, Time).Nanosecond() >>> 0)), std >> 16 >> 0, (std & 65535) === 33);
				}
			}
		}
		$s = -1; return b;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.AppendFormat }; } $f._1 = _1; $f._q = _q; $f._q$1 = _q$1; $f._q$2 = _q$2; $f._q$3 = _q$3; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._r$5 = _r$5; $f._r$6 = _r$6; $f._tuple = _tuple; $f._tuple$1 = _tuple$1; $f._tuple$2 = _tuple$2; $f._tuple$3 = _tuple$3; $f.abs = abs; $f.absoffset = absoffset; $f.b = b; $f.day = day; $f.hour = hour; $f.hr = hr; $f.hr$1 = hr$1; $f.layout = layout; $f.m = m; $f.min = min; $f.month = month; $f.name = name; $f.offset = offset; $f.prefix = prefix; $f.s = s; $f.sec = sec; $f.std = std; $f.suffix = suffix; $f.t = t; $f.y = y; $f.year = year; $f.zone$1 = zone$1; $f.zone$2 = zone$2; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.AppendFormat = function(b, layout) { return this.$val.AppendFormat(b, layout); };
	quote = function(s) {
		var s;
		return "\"" + s + "\"";
	};
	ParseError.ptr.prototype.Error = function() {
		var e;
		e = this;
		if (e.Message === "") {
			return "parsing time " + quote(e.Value) + " as " + quote(e.Layout) + ": cannot parse " + quote(e.ValueElem) + " as " + quote(e.LayoutElem);
		}
		return "parsing time " + quote(e.Value) + e.Message;
	};
	ParseError.prototype.Error = function() { return this.$val.Error(); };
	isDigit = function(s, i) {
		var c, i, s;
		if (s.length <= i) {
			return false;
		}
		c = s.charCodeAt(i);
		return 48 <= c && c <= 57;
	};
	getnum = function(s, fixed) {
		var fixed, s;
		if (!isDigit(s, 0)) {
			return [0, s, errBad];
		}
		if (!isDigit(s, 1)) {
			if (fixed) {
				return [0, s, errBad];
			}
			return [(((s.charCodeAt(0) - 48 << 24 >>> 24) >> 0)), $substring(s, 1), $ifaceNil];
		}
		return [($imul((((s.charCodeAt(0) - 48 << 24 >>> 24) >> 0)), 10)) + (((s.charCodeAt(1) - 48 << 24 >>> 24) >> 0)) >> 0, $substring(s, 2), $ifaceNil];
	};
	cutspace = function(s) {
		var s;
		while (true) {
			if (!(s.length > 0 && (s.charCodeAt(0) === 32))) { break; }
			s = $substring(s, 1);
		}
		return s;
	};
	skip = function(value, prefix) {
		var prefix, value;
		while (true) {
			if (!(prefix.length > 0)) { break; }
			if (prefix.charCodeAt(0) === 32) {
				if (value.length > 0 && !((value.charCodeAt(0) === 32))) {
					return [value, errBad];
				}
				prefix = cutspace(prefix);
				value = cutspace(value);
				continue;
			}
			if ((value.length === 0) || !((value.charCodeAt(0) === prefix.charCodeAt(0)))) {
				return [value, errBad];
			}
			prefix = $substring(prefix, 1);
			value = $substring(value, 1);
		}
		return [value, $ifaceNil];
	};
	Parse = function(layout, value) {
		var _r, layout, value, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; layout = $f.layout; value = $f.value; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = parse(layout, value, $pkg.UTC, $pkg.Local); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Parse }; } $f._r = _r; $f.layout = layout; $f.value = value; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.Parse = Parse;
	parse = function(layout, value, defaultLocation, local) {
		var _1, _2, _3, _4, _r, _r$1, _r$2, _r$3, _r$4, _r$5, _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$18, _tmp$19, _tmp$2, _tmp$20, _tmp$21, _tmp$22, _tmp$23, _tmp$24, _tmp$25, _tmp$26, _tmp$27, _tmp$28, _tmp$29, _tmp$3, _tmp$30, _tmp$31, _tmp$32, _tmp$33, _tmp$34, _tmp$35, _tmp$36, _tmp$37, _tmp$38, _tmp$39, _tmp$4, _tmp$40, _tmp$41, _tmp$42, _tmp$43, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tuple, _tuple$1, _tuple$10, _tuple$11, _tuple$12, _tuple$13, _tuple$14, _tuple$15, _tuple$16, _tuple$17, _tuple$18, _tuple$19, _tuple$2, _tuple$20, _tuple$21, _tuple$22, _tuple$23, _tuple$24, _tuple$3, _tuple$4, _tuple$5, _tuple$6, _tuple$7, _tuple$8, _tuple$9, alayout, amSet, avalue, day, defaultLocation, err, hour, hour$1, hr, i, layout, local, min, min$1, mm, month, n, n$1, name, ndigit, nsec, offset, offset$1, ok, ok$1, p, pmSet, prefix, rangeErrString, sec, seconds, sign, ss, std, stdstr, suffix, t, t$1, value, x$1, x$2, year, z, zoneName, zoneOffset, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _1 = $f._1; _2 = $f._2; _3 = $f._3; _4 = $f._4; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _r$5 = $f._r$5; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$10 = $f._tmp$10; _tmp$11 = $f._tmp$11; _tmp$12 = $f._tmp$12; _tmp$13 = $f._tmp$13; _tmp$14 = $f._tmp$14; _tmp$15 = $f._tmp$15; _tmp$16 = $f._tmp$16; _tmp$17 = $f._tmp$17; _tmp$18 = $f._tmp$18; _tmp$19 = $f._tmp$19; _tmp$2 = $f._tmp$2; _tmp$20 = $f._tmp$20; _tmp$21 = $f._tmp$21; _tmp$22 = $f._tmp$22; _tmp$23 = $f._tmp$23; _tmp$24 = $f._tmp$24; _tmp$25 = $f._tmp$25; _tmp$26 = $f._tmp$26; _tmp$27 = $f._tmp$27; _tmp$28 = $f._tmp$28; _tmp$29 = $f._tmp$29; _tmp$3 = $f._tmp$3; _tmp$30 = $f._tmp$30; _tmp$31 = $f._tmp$31; _tmp$32 = $f._tmp$32; _tmp$33 = $f._tmp$33; _tmp$34 = $f._tmp$34; _tmp$35 = $f._tmp$35; _tmp$36 = $f._tmp$36; _tmp$37 = $f._tmp$37; _tmp$38 = $f._tmp$38; _tmp$39 = $f._tmp$39; _tmp$4 = $f._tmp$4; _tmp$40 = $f._tmp$40; _tmp$41 = $f._tmp$41; _tmp$42 = $f._tmp$42; _tmp$43 = $f._tmp$43; _tmp$5 = $f._tmp$5; _tmp$6 = $f._tmp$6; _tmp$7 = $f._tmp$7; _tmp$8 = $f._tmp$8; _tmp$9 = $f._tmp$9; _tuple = $f._tuple; _tuple$1 = $f._tuple$1; _tuple$10 = $f._tuple$10; _tuple$11 = $f._tuple$11; _tuple$12 = $f._tuple$12; _tuple$13 = $f._tuple$13; _tuple$14 = $f._tuple$14; _tuple$15 = $f._tuple$15; _tuple$16 = $f._tuple$16; _tuple$17 = $f._tuple$17; _tuple$18 = $f._tuple$18; _tuple$19 = $f._tuple$19; _tuple$2 = $f._tuple$2; _tuple$20 = $f._tuple$20; _tuple$21 = $f._tuple$21; _tuple$22 = $f._tuple$22; _tuple$23 = $f._tuple$23; _tuple$24 = $f._tuple$24; _tuple$3 = $f._tuple$3; _tuple$4 = $f._tuple$4; _tuple$5 = $f._tuple$5; _tuple$6 = $f._tuple$6; _tuple$7 = $f._tuple$7; _tuple$8 = $f._tuple$8; _tuple$9 = $f._tuple$9; alayout = $f.alayout; amSet = $f.amSet; avalue = $f.avalue; day = $f.day; defaultLocation = $f.defaultLocation; err = $f.err; hour = $f.hour; hour$1 = $f.hour$1; hr = $f.hr; i = $f.i; layout = $f.layout; local = $f.local; min = $f.min; min$1 = $f.min$1; mm = $f.mm; month = $f.month; n = $f.n; n$1 = $f.n$1; name = $f.name; ndigit = $f.ndigit; nsec = $f.nsec; offset = $f.offset; offset$1 = $f.offset$1; ok = $f.ok; ok$1 = $f.ok$1; p = $f.p; pmSet = $f.pmSet; prefix = $f.prefix; rangeErrString = $f.rangeErrString; sec = $f.sec; seconds = $f.seconds; sign = $f.sign; ss = $f.ss; std = $f.std; stdstr = $f.stdstr; suffix = $f.suffix; t = $f.t; t$1 = $f.t$1; value = $f.value; x$1 = $f.x$1; x$2 = $f.x$2; year = $f.year; z = $f.z; zoneName = $f.zoneName; zoneOffset = $f.zoneOffset; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_tmp = layout;
		_tmp$1 = value;
		alayout = _tmp;
		avalue = _tmp$1;
		rangeErrString = "";
		amSet = false;
		pmSet = false;
		year = 0;
		month = 1;
		day = 1;
		hour = 0;
		min = 0;
		sec = 0;
		nsec = 0;
		z = ptrType$2.nil;
		zoneOffset = -1;
		zoneName = "";
		while (true) {
			err = $ifaceNil;
			_tuple = nextStdChunk(layout);
			prefix = _tuple[0];
			std = _tuple[1];
			suffix = _tuple[2];
			stdstr = $substring(layout, prefix.length, (layout.length - suffix.length >> 0));
			_tuple$1 = skip(value, prefix);
			value = _tuple$1[0];
			err = _tuple$1[1];
			if (!($interfaceIsEqual(err, $ifaceNil))) {
				$s = -1; return [new Time.ptr(new $Uint64(0, 0), new $Int64(0, 0), ptrType$2.nil), new ParseError.ptr(alayout, avalue, prefix, value, "")];
			}
			if (std === 0) {
				if (!((value.length === 0))) {
					$s = -1; return [new Time.ptr(new $Uint64(0, 0), new $Int64(0, 0), ptrType$2.nil), new ParseError.ptr(alayout, avalue, "", value, ": extra text: " + value)];
				}
				break;
			}
			layout = suffix;
			p = "";
			switch (0) { default:
				_1 = std & 65535;
				if (_1 === (274)) {
					if (value.length < 2) {
						err = errBad;
						break;
					}
					_tmp$2 = $substring(value, 0, 2);
					_tmp$3 = $substring(value, 2);
					p = _tmp$2;
					value = _tmp$3;
					_tuple$2 = atoi(p);
					year = _tuple$2[0];
					err = _tuple$2[1];
					if (year >= 69) {
						year = year + (1900) >> 0;
					} else {
						year = year + (2000) >> 0;
					}
				} else if (_1 === (273)) {
					if (value.length < 4 || !isDigit(value, 0)) {
						err = errBad;
						break;
					}
					_tmp$4 = $substring(value, 0, 4);
					_tmp$5 = $substring(value, 4);
					p = _tmp$4;
					value = _tmp$5;
					_tuple$3 = atoi(p);
					year = _tuple$3[0];
					err = _tuple$3[1];
				} else if (_1 === (258)) {
					_tuple$4 = lookup(shortMonthNames, value);
					month = _tuple$4[0];
					value = _tuple$4[1];
					err = _tuple$4[2];
					month = month + (1) >> 0;
				} else if (_1 === (257)) {
					_tuple$5 = lookup(longMonthNames, value);
					month = _tuple$5[0];
					value = _tuple$5[1];
					err = _tuple$5[2];
					month = month + (1) >> 0;
				} else if ((_1 === (259)) || (_1 === (260))) {
					_tuple$6 = getnum(value, std === 260);
					month = _tuple$6[0];
					value = _tuple$6[1];
					err = _tuple$6[2];
					if (month <= 0 || 12 < month) {
						rangeErrString = "month";
					}
				} else if (_1 === (262)) {
					_tuple$7 = lookup(shortDayNames, value);
					value = _tuple$7[1];
					err = _tuple$7[2];
				} else if (_1 === (261)) {
					_tuple$8 = lookup(longDayNames, value);
					value = _tuple$8[1];
					err = _tuple$8[2];
				} else if ((_1 === (263)) || (_1 === (264)) || (_1 === (265))) {
					if ((std === 264) && value.length > 0 && (value.charCodeAt(0) === 32)) {
						value = $substring(value, 1);
					}
					_tuple$9 = getnum(value, std === 265);
					day = _tuple$9[0];
					value = _tuple$9[1];
					err = _tuple$9[2];
					if (day < 0) {
						rangeErrString = "day";
					}
				} else if (_1 === (522)) {
					_tuple$10 = getnum(value, false);
					hour = _tuple$10[0];
					value = _tuple$10[1];
					err = _tuple$10[2];
					if (hour < 0 || 24 <= hour) {
						rangeErrString = "hour";
					}
				} else if ((_1 === (523)) || (_1 === (524))) {
					_tuple$11 = getnum(value, std === 524);
					hour = _tuple$11[0];
					value = _tuple$11[1];
					err = _tuple$11[2];
					if (hour < 0 || 12 < hour) {
						rangeErrString = "hour";
					}
				} else if ((_1 === (525)) || (_1 === (526))) {
					_tuple$12 = getnum(value, std === 526);
					min = _tuple$12[0];
					value = _tuple$12[1];
					err = _tuple$12[2];
					if (min < 0 || 60 <= min) {
						rangeErrString = "minute";
					}
				} else if ((_1 === (527)) || (_1 === (528))) {
					_tuple$13 = getnum(value, std === 528);
					sec = _tuple$13[0];
					value = _tuple$13[1];
					err = _tuple$13[2];
					if (sec < 0 || 60 <= sec) {
						rangeErrString = "second";
						break;
					}
					if (value.length >= 2 && (value.charCodeAt(0) === 46) && isDigit(value, 1)) {
						_tuple$14 = nextStdChunk(layout);
						std = _tuple$14[1];
						std = std & (65535);
						if ((std === 32) || (std === 33)) {
							break;
						}
						n = 2;
						while (true) {
							if (!(n < value.length && isDigit(value, n))) { break; }
							n = n + (1) >> 0;
						}
						_tuple$15 = parseNanoseconds(value, n);
						nsec = _tuple$15[0];
						rangeErrString = _tuple$15[1];
						err = _tuple$15[2];
						value = $substring(value, n);
					}
				} else if (_1 === (531)) {
					if (value.length < 2) {
						err = errBad;
						break;
					}
					_tmp$6 = $substring(value, 0, 2);
					_tmp$7 = $substring(value, 2);
					p = _tmp$6;
					value = _tmp$7;
					_2 = p;
					if (_2 === ("PM")) {
						pmSet = true;
					} else if (_2 === ("AM")) {
						amSet = true;
					} else {
						err = errBad;
					}
				} else if (_1 === (532)) {
					if (value.length < 2) {
						err = errBad;
						break;
					}
					_tmp$8 = $substring(value, 0, 2);
					_tmp$9 = $substring(value, 2);
					p = _tmp$8;
					value = _tmp$9;
					_3 = p;
					if (_3 === ("pm")) {
						pmSet = true;
					} else if (_3 === ("am")) {
						amSet = true;
					} else {
						err = errBad;
					}
				} else if ((_1 === (22)) || (_1 === (25)) || (_1 === (23)) || (_1 === (24)) || (_1 === (26)) || (_1 === (27)) || (_1 === (29)) || (_1 === (30)) || (_1 === (28)) || (_1 === (31))) {
					if (((std === 22) || (std === 24) || (std === 25)) && value.length >= 1 && (value.charCodeAt(0) === 90)) {
						value = $substring(value, 1);
						z = $pkg.UTC;
						break;
					}
					_tmp$10 = "";
					_tmp$11 = "";
					_tmp$12 = "";
					_tmp$13 = "";
					sign = _tmp$10;
					hour$1 = _tmp$11;
					min$1 = _tmp$12;
					seconds = _tmp$13;
					if ((std === 25) || (std === 30)) {
						if (value.length < 6) {
							err = errBad;
							break;
						}
						if (!((value.charCodeAt(3) === 58))) {
							err = errBad;
							break;
						}
						_tmp$14 = $substring(value, 0, 1);
						_tmp$15 = $substring(value, 1, 3);
						_tmp$16 = $substring(value, 4, 6);
						_tmp$17 = "00";
						_tmp$18 = $substring(value, 6);
						sign = _tmp$14;
						hour$1 = _tmp$15;
						min$1 = _tmp$16;
						seconds = _tmp$17;
						value = _tmp$18;
					} else if ((std === 29) || (std === 24)) {
						if (value.length < 3) {
							err = errBad;
							break;
						}
						_tmp$19 = $substring(value, 0, 1);
						_tmp$20 = $substring(value, 1, 3);
						_tmp$21 = "00";
						_tmp$22 = "00";
						_tmp$23 = $substring(value, 3);
						sign = _tmp$19;
						hour$1 = _tmp$20;
						min$1 = _tmp$21;
						seconds = _tmp$22;
						value = _tmp$23;
					} else if ((std === 26) || (std === 31)) {
						if (value.length < 9) {
							err = errBad;
							break;
						}
						if (!((value.charCodeAt(3) === 58)) || !((value.charCodeAt(6) === 58))) {
							err = errBad;
							break;
						}
						_tmp$24 = $substring(value, 0, 1);
						_tmp$25 = $substring(value, 1, 3);
						_tmp$26 = $substring(value, 4, 6);
						_tmp$27 = $substring(value, 7, 9);
						_tmp$28 = $substring(value, 9);
						sign = _tmp$24;
						hour$1 = _tmp$25;
						min$1 = _tmp$26;
						seconds = _tmp$27;
						value = _tmp$28;
					} else if ((std === 23) || (std === 28)) {
						if (value.length < 7) {
							err = errBad;
							break;
						}
						_tmp$29 = $substring(value, 0, 1);
						_tmp$30 = $substring(value, 1, 3);
						_tmp$31 = $substring(value, 3, 5);
						_tmp$32 = $substring(value, 5, 7);
						_tmp$33 = $substring(value, 7);
						sign = _tmp$29;
						hour$1 = _tmp$30;
						min$1 = _tmp$31;
						seconds = _tmp$32;
						value = _tmp$33;
					} else {
						if (value.length < 5) {
							err = errBad;
							break;
						}
						_tmp$34 = $substring(value, 0, 1);
						_tmp$35 = $substring(value, 1, 3);
						_tmp$36 = $substring(value, 3, 5);
						_tmp$37 = "00";
						_tmp$38 = $substring(value, 5);
						sign = _tmp$34;
						hour$1 = _tmp$35;
						min$1 = _tmp$36;
						seconds = _tmp$37;
						value = _tmp$38;
					}
					_tmp$39 = 0;
					_tmp$40 = 0;
					_tmp$41 = 0;
					hr = _tmp$39;
					mm = _tmp$40;
					ss = _tmp$41;
					_tuple$16 = atoi(hour$1);
					hr = _tuple$16[0];
					err = _tuple$16[1];
					if ($interfaceIsEqual(err, $ifaceNil)) {
						_tuple$17 = atoi(min$1);
						mm = _tuple$17[0];
						err = _tuple$17[1];
					}
					if ($interfaceIsEqual(err, $ifaceNil)) {
						_tuple$18 = atoi(seconds);
						ss = _tuple$18[0];
						err = _tuple$18[1];
					}
					zoneOffset = ($imul(((($imul(hr, 60)) + mm >> 0)), 60)) + ss >> 0;
					_4 = sign.charCodeAt(0);
					if (_4 === (43)) {
					} else if (_4 === (45)) {
						zoneOffset = -zoneOffset;
					} else {
						err = errBad;
					}
				} else if (_1 === (21)) {
					if (value.length >= 3 && $substring(value, 0, 3) === "UTC") {
						z = $pkg.UTC;
						value = $substring(value, 3);
						break;
					}
					_tuple$19 = parseTimeZone(value);
					n$1 = _tuple$19[0];
					ok = _tuple$19[1];
					if (!ok) {
						err = errBad;
						break;
					}
					_tmp$42 = $substring(value, 0, n$1);
					_tmp$43 = $substring(value, n$1);
					zoneName = _tmp$42;
					value = _tmp$43;
				} else if (_1 === (32)) {
					ndigit = 1 + ((std >> 16 >> 0)) >> 0;
					if (value.length < ndigit) {
						err = errBad;
						break;
					}
					_tuple$20 = parseNanoseconds(value, ndigit);
					nsec = _tuple$20[0];
					rangeErrString = _tuple$20[1];
					err = _tuple$20[2];
					value = $substring(value, ndigit);
				} else if (_1 === (33)) {
					if (value.length < 2 || !((value.charCodeAt(0) === 46)) || value.charCodeAt(1) < 48 || 57 < value.charCodeAt(1)) {
						break;
					}
					i = 0;
					while (true) {
						if (!(i < 9 && (i + 1 >> 0) < value.length && 48 <= value.charCodeAt((i + 1 >> 0)) && value.charCodeAt((i + 1 >> 0)) <= 57)) { break; }
						i = i + (1) >> 0;
					}
					_tuple$21 = parseNanoseconds(value, 1 + i >> 0);
					nsec = _tuple$21[0];
					rangeErrString = _tuple$21[1];
					err = _tuple$21[2];
					value = $substring(value, (1 + i >> 0));
				}
			}
			if (!(rangeErrString === "")) {
				$s = -1; return [new Time.ptr(new $Uint64(0, 0), new $Int64(0, 0), ptrType$2.nil), new ParseError.ptr(alayout, avalue, stdstr, value, ": " + rangeErrString + " out of range")];
			}
			if (!($interfaceIsEqual(err, $ifaceNil))) {
				$s = -1; return [new Time.ptr(new $Uint64(0, 0), new $Int64(0, 0), ptrType$2.nil), new ParseError.ptr(alayout, avalue, stdstr, value, "")];
			}
		}
		if (pmSet && hour < 12) {
			hour = hour + (12) >> 0;
		} else if (amSet && (hour === 12)) {
			hour = 0;
		}
		if (day < 1 || day > daysIn(((month >> 0)), year)) {
			$s = -1; return [new Time.ptr(new $Uint64(0, 0), new $Int64(0, 0), ptrType$2.nil), new ParseError.ptr(alayout, avalue, "", value, ": day out of range")];
		}
		/* */ if (!(z === ptrType$2.nil)) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!(z === ptrType$2.nil)) { */ case 1:
			_r = Date(year, ((month >> 0)), day, hour, min, sec, nsec, z); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			$s = -1; return [_r, $ifaceNil];
		/* } */ case 2:
		/* */ if (!((zoneOffset === -1))) { $s = 4; continue; }
		/* */ $s = 5; continue;
		/* if (!((zoneOffset === -1))) { */ case 4:
			_r$1 = Date(year, ((month >> 0)), day, hour, min, sec, nsec, $pkg.UTC); /* */ $s = 6; case 6: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			t = $clone(_r$1, Time);
			t.addSec((x$1 = (new $Int64(0, zoneOffset)), new $Int64(-x$1.$high, -x$1.$low)));
			_r$2 = local.lookup(t.unixSec()); /* */ $s = 7; case 7: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
			_tuple$22 = _r$2;
			name = _tuple$22[0];
			offset = _tuple$22[1];
			if ((offset === zoneOffset) && (zoneName === "" || name === zoneName)) {
				t.setLoc(local);
				$s = -1; return [t, $ifaceNil];
			}
			t.setLoc(FixedZone(zoneName, zoneOffset));
			$s = -1; return [t, $ifaceNil];
		/* } */ case 5:
		/* */ if (!(zoneName === "")) { $s = 8; continue; }
		/* */ $s = 9; continue;
		/* if (!(zoneName === "")) { */ case 8:
			_r$3 = Date(year, ((month >> 0)), day, hour, min, sec, nsec, $pkg.UTC); /* */ $s = 10; case 10: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
			t$1 = $clone(_r$3, Time);
			_r$4 = local.lookupName(zoneName, t$1.unixSec()); /* */ $s = 11; case 11: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
			_tuple$23 = _r$4;
			offset$1 = _tuple$23[0];
			ok$1 = _tuple$23[1];
			if (ok$1) {
				t$1.addSec((x$2 = (new $Int64(0, offset$1)), new $Int64(-x$2.$high, -x$2.$low)));
				t$1.setLoc(local);
				$s = -1; return [t$1, $ifaceNil];
			}
			if (zoneName.length > 3 && $substring(zoneName, 0, 3) === "GMT") {
				_tuple$24 = atoi($substring(zoneName, 3));
				offset$1 = _tuple$24[0];
				offset$1 = $imul(offset$1, (3600));
			}
			t$1.setLoc(FixedZone(zoneName, offset$1));
			$s = -1; return [t$1, $ifaceNil];
		/* } */ case 9:
		_r$5 = Date(year, ((month >> 0)), day, hour, min, sec, nsec, defaultLocation); /* */ $s = 12; case 12: if($c) { $c = false; _r$5 = _r$5.$blk(); } if (_r$5 && _r$5.$blk !== undefined) { break s; }
		$s = -1; return [_r$5, $ifaceNil];
		/* */ } return; } if ($f === undefined) { $f = { $blk: parse }; } $f._1 = _1; $f._2 = _2; $f._3 = _3; $f._4 = _4; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._r$5 = _r$5; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$10 = _tmp$10; $f._tmp$11 = _tmp$11; $f._tmp$12 = _tmp$12; $f._tmp$13 = _tmp$13; $f._tmp$14 = _tmp$14; $f._tmp$15 = _tmp$15; $f._tmp$16 = _tmp$16; $f._tmp$17 = _tmp$17; $f._tmp$18 = _tmp$18; $f._tmp$19 = _tmp$19; $f._tmp$2 = _tmp$2; $f._tmp$20 = _tmp$20; $f._tmp$21 = _tmp$21; $f._tmp$22 = _tmp$22; $f._tmp$23 = _tmp$23; $f._tmp$24 = _tmp$24; $f._tmp$25 = _tmp$25; $f._tmp$26 = _tmp$26; $f._tmp$27 = _tmp$27; $f._tmp$28 = _tmp$28; $f._tmp$29 = _tmp$29; $f._tmp$3 = _tmp$3; $f._tmp$30 = _tmp$30; $f._tmp$31 = _tmp$31; $f._tmp$32 = _tmp$32; $f._tmp$33 = _tmp$33; $f._tmp$34 = _tmp$34; $f._tmp$35 = _tmp$35; $f._tmp$36 = _tmp$36; $f._tmp$37 = _tmp$37; $f._tmp$38 = _tmp$38; $f._tmp$39 = _tmp$39; $f._tmp$4 = _tmp$4; $f._tmp$40 = _tmp$40; $f._tmp$41 = _tmp$41; $f._tmp$42 = _tmp$42; $f._tmp$43 = _tmp$43; $f._tmp$5 = _tmp$5; $f._tmp$6 = _tmp$6; $f._tmp$7 = _tmp$7; $f._tmp$8 = _tmp$8; $f._tmp$9 = _tmp$9; $f._tuple = _tuple; $f._tuple$1 = _tuple$1; $f._tuple$10 = _tuple$10; $f._tuple$11 = _tuple$11; $f._tuple$12 = _tuple$12; $f._tuple$13 = _tuple$13; $f._tuple$14 = _tuple$14; $f._tuple$15 = _tuple$15; $f._tuple$16 = _tuple$16; $f._tuple$17 = _tuple$17; $f._tuple$18 = _tuple$18; $f._tuple$19 = _tuple$19; $f._tuple$2 = _tuple$2; $f._tuple$20 = _tuple$20; $f._tuple$21 = _tuple$21; $f._tuple$22 = _tuple$22; $f._tuple$23 = _tuple$23; $f._tuple$24 = _tuple$24; $f._tuple$3 = _tuple$3; $f._tuple$4 = _tuple$4; $f._tuple$5 = _tuple$5; $f._tuple$6 = _tuple$6; $f._tuple$7 = _tuple$7; $f._tuple$8 = _tuple$8; $f._tuple$9 = _tuple$9; $f.alayout = alayout; $f.amSet = amSet; $f.avalue = avalue; $f.day = day; $f.defaultLocation = defaultLocation; $f.err = err; $f.hour = hour; $f.hour$1 = hour$1; $f.hr = hr; $f.i = i; $f.layout = layout; $f.local = local; $f.min = min; $f.min$1 = min$1; $f.mm = mm; $f.month = month; $f.n = n; $f.n$1 = n$1; $f.name = name; $f.ndigit = ndigit; $f.nsec = nsec; $f.offset = offset; $f.offset$1 = offset$1; $f.ok = ok; $f.ok$1 = ok$1; $f.p = p; $f.pmSet = pmSet; $f.prefix = prefix; $f.rangeErrString = rangeErrString; $f.sec = sec; $f.seconds = seconds; $f.sign = sign; $f.ss = ss; $f.std = std; $f.stdstr = stdstr; $f.suffix = suffix; $f.t = t; $f.t$1 = t$1; $f.value = value; $f.x$1 = x$1; $f.x$2 = x$2; $f.year = year; $f.z = z; $f.zoneName = zoneName; $f.zoneOffset = zoneOffset; $f.$s = $s; $f.$r = $r; return $f;
	};
	parseTimeZone = function(value) {
		var _1, _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, c, length, nUpper, ok, ok$1, value;
		length = 0;
		ok = false;
		if (value.length < 3) {
			_tmp = 0;
			_tmp$1 = false;
			length = _tmp;
			ok = _tmp$1;
			return [length, ok];
		}
		if (value.length >= 4 && ($substring(value, 0, 4) === "ChST" || $substring(value, 0, 4) === "MeST")) {
			_tmp$2 = 4;
			_tmp$3 = true;
			length = _tmp$2;
			ok = _tmp$3;
			return [length, ok];
		}
		if ($substring(value, 0, 3) === "GMT") {
			length = parseGMT(value);
			_tmp$4 = length;
			_tmp$5 = true;
			length = _tmp$4;
			ok = _tmp$5;
			return [length, ok];
		}
		if ((value.charCodeAt(0) === 43) || (value.charCodeAt(0) === 45)) {
			length = parseSignedOffset(value);
			ok$1 = length > 0;
			_tmp$6 = length;
			_tmp$7 = ok$1;
			length = _tmp$6;
			ok = _tmp$7;
			return [length, ok];
		}
		nUpper = 0;
		nUpper = 0;
		while (true) {
			if (!(nUpper < 6)) { break; }
			if (nUpper >= value.length) {
				break;
			}
			c = value.charCodeAt(nUpper);
			if (c < 65 || 90 < c) {
				break;
			}
			nUpper = nUpper + (1) >> 0;
		}
		_1 = nUpper;
		if ((_1 === (0)) || (_1 === (1)) || (_1 === (2)) || (_1 === (6))) {
			_tmp$8 = 0;
			_tmp$9 = false;
			length = _tmp$8;
			ok = _tmp$9;
			return [length, ok];
		} else if (_1 === (5)) {
			if (value.charCodeAt(4) === 84) {
				_tmp$10 = 5;
				_tmp$11 = true;
				length = _tmp$10;
				ok = _tmp$11;
				return [length, ok];
			}
		} else if (_1 === (4)) {
			if ((value.charCodeAt(3) === 84) || $substring(value, 0, 4) === "WITA") {
				_tmp$12 = 4;
				_tmp$13 = true;
				length = _tmp$12;
				ok = _tmp$13;
				return [length, ok];
			}
		} else if (_1 === (3)) {
			_tmp$14 = 3;
			_tmp$15 = true;
			length = _tmp$14;
			ok = _tmp$15;
			return [length, ok];
		}
		_tmp$16 = 0;
		_tmp$17 = false;
		length = _tmp$16;
		ok = _tmp$17;
		return [length, ok];
	};
	parseGMT = function(value) {
		var value;
		value = $substring(value, 3);
		if (value.length === 0) {
			return 3;
		}
		return 3 + parseSignedOffset(value) >> 0;
	};
	parseSignedOffset = function(value) {
		var _tuple, err, rem, sign, value, x$1;
		sign = value.charCodeAt(0);
		if (!((sign === 45)) && !((sign === 43))) {
			return 0;
		}
		_tuple = leadingInt($substring(value, 1));
		x$1 = _tuple[0];
		rem = _tuple[1];
		err = _tuple[2];
		if (!($interfaceIsEqual(err, $ifaceNil)) || $substring(value, 1) === rem) {
			return 0;
		}
		if (sign === 45) {
			x$1 = new $Int64(-x$1.$high, -x$1.$low);
		}
		if ((x$1.$high < -1 || (x$1.$high === -1 && x$1.$low < 4294967273)) || (0 < x$1.$high || (0 === x$1.$high && 23 < x$1.$low))) {
			return 0;
		}
		return value.length - rem.length >> 0;
	};
	parseNanoseconds = function(value, nbytes) {
		var _tuple, err, i, nbytes, ns, rangeErrString, scaleDigits, value;
		ns = 0;
		rangeErrString = "";
		err = $ifaceNil;
		if (!((value.charCodeAt(0) === 46))) {
			err = errBad;
			return [ns, rangeErrString, err];
		}
		_tuple = atoi($substring(value, 1, nbytes));
		ns = _tuple[0];
		err = _tuple[1];
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			return [ns, rangeErrString, err];
		}
		if (ns < 0 || 1000000000 <= ns) {
			rangeErrString = "fractional second";
			return [ns, rangeErrString, err];
		}
		scaleDigits = 10 - nbytes >> 0;
		i = 0;
		while (true) {
			if (!(i < scaleDigits)) { break; }
			ns = $imul(ns, (10));
			i = i + (1) >> 0;
		}
		return [ns, rangeErrString, err];
	};
	leadingInt = function(s) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, c, err, i, rem, s, x$1, x$2, x$3, x$4;
		x$1 = new $Int64(0, 0);
		rem = "";
		err = $ifaceNil;
		i = 0;
		while (true) {
			if (!(i < s.length)) { break; }
			c = s.charCodeAt(i);
			if (c < 48 || c > 57) {
				break;
			}
			if ((x$1.$high > 214748364 || (x$1.$high === 214748364 && x$1.$low > 3435973836))) {
				_tmp = new $Int64(0, 0);
				_tmp$1 = "";
				_tmp$2 = errLeadingInt;
				x$1 = _tmp;
				rem = _tmp$1;
				err = _tmp$2;
				return [x$1, rem, err];
			}
			x$1 = (x$2 = (x$3 = $mul64(x$1, new $Int64(0, 10)), x$4 = (new $Int64(0, c)), new $Int64(x$3.$high + x$4.$high, x$3.$low + x$4.$low)), new $Int64(x$2.$high - 0, x$2.$low - 48));
			if ((x$1.$high < 0 || (x$1.$high === 0 && x$1.$low < 0))) {
				_tmp$3 = new $Int64(0, 0);
				_tmp$4 = "";
				_tmp$5 = errLeadingInt;
				x$1 = _tmp$3;
				rem = _tmp$4;
				err = _tmp$5;
				return [x$1, rem, err];
			}
			i = i + (1) >> 0;
		}
		_tmp$6 = x$1;
		_tmp$7 = $substring(s, i);
		_tmp$8 = $ifaceNil;
		x$1 = _tmp$6;
		rem = _tmp$7;
		err = _tmp$8;
		return [x$1, rem, err];
	};
	Time.ptr.prototype.nsec = function() {
		var t, x$1;
		t = this;
		return (((x$1 = t.wall, new $Uint64(x$1.$high & 0, (x$1.$low & 1073741823) >>> 0)).$low >> 0));
	};
	Time.prototype.nsec = function() { return this.$val.nsec(); };
	Time.ptr.prototype.sec = function() {
		var t, x$1, x$2, x$3, x$4;
		t = this;
		if (!((x$1 = (x$2 = t.wall, new $Uint64(x$2.$high & 2147483648, (x$2.$low & 0) >>> 0)), (x$1.$high === 0 && x$1.$low === 0)))) {
			return (x$3 = ((x$4 = $shiftRightUint64($shiftLeft64(t.wall, 1), 31), new $Int64(x$4.$high, x$4.$low))), new $Int64(13 + x$3.$high, 3618733952 + x$3.$low));
		}
		return t.ext;
	};
	Time.prototype.sec = function() { return this.$val.sec(); };
	Time.ptr.prototype.unixSec = function() {
		var t, x$1;
		t = this;
		return (x$1 = t.sec(), new $Int64(x$1.$high + -15, x$1.$low + 2288912640));
	};
	Time.prototype.unixSec = function() { return this.$val.unixSec(); };
	Time.ptr.prototype.addSec = function(d) {
		var d, dsec, sec, t, x$1, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		t = this;
		if (!((x$1 = (x$2 = t.wall, new $Uint64(x$2.$high & 2147483648, (x$2.$low & 0) >>> 0)), (x$1.$high === 0 && x$1.$low === 0)))) {
			sec = ((x$3 = $shiftRightUint64($shiftLeft64(t.wall, 1), 31), new $Int64(x$3.$high, x$3.$low)));
			dsec = new $Int64(sec.$high + d.$high, sec.$low + d.$low);
			if ((0 < dsec.$high || (0 === dsec.$high && 0 <= dsec.$low)) && (dsec.$high < 1 || (dsec.$high === 1 && dsec.$low <= 4294967295))) {
				t.wall = (x$4 = (x$5 = (x$6 = t.wall, new $Uint64(x$6.$high & 0, (x$6.$low & 1073741823) >>> 0)), x$7 = $shiftLeft64((new $Uint64(dsec.$high, dsec.$low)), 30), new $Uint64(x$5.$high | x$7.$high, (x$5.$low | x$7.$low) >>> 0)), new $Uint64(x$4.$high | 2147483648, (x$4.$low | 0) >>> 0));
				return;
			}
			t.stripMono();
		}
		t.ext = (x$8 = t.ext, x$9 = d, new $Int64(x$8.$high + x$9.$high, x$8.$low + x$9.$low));
	};
	Time.prototype.addSec = function(d) { return this.$val.addSec(d); };
	Time.ptr.prototype.setLoc = function(loc) {
		var loc, t;
		t = this;
		if (loc === utcLoc) {
			loc = ptrType$2.nil;
		}
		t.stripMono();
		t.loc = loc;
	};
	Time.prototype.setLoc = function(loc) { return this.$val.setLoc(loc); };
	Time.ptr.prototype.stripMono = function() {
		var t, x$1, x$2, x$3, x$4;
		t = this;
		if (!((x$1 = (x$2 = t.wall, new $Uint64(x$2.$high & 2147483648, (x$2.$low & 0) >>> 0)), (x$1.$high === 0 && x$1.$low === 0)))) {
			t.ext = t.sec();
			t.wall = (x$3 = t.wall, x$4 = new $Uint64(0, 1073741823), new $Uint64(x$3.$high & x$4.$high, (x$3.$low & x$4.$low) >>> 0));
		}
	};
	Time.prototype.stripMono = function() { return this.$val.stripMono(); };
	Time.ptr.prototype.After = function(u) {
		var t, ts, u, us, x$1, x$2, x$3, x$4, x$5, x$6;
		t = this;
		if (!((x$1 = (x$2 = (x$3 = t.wall, x$4 = u.wall, new $Uint64(x$3.$high & x$4.$high, (x$3.$low & x$4.$low) >>> 0)), new $Uint64(x$2.$high & 2147483648, (x$2.$low & 0) >>> 0)), (x$1.$high === 0 && x$1.$low === 0)))) {
			return (x$5 = t.ext, x$6 = u.ext, (x$5.$high > x$6.$high || (x$5.$high === x$6.$high && x$5.$low > x$6.$low)));
		}
		ts = t.sec();
		us = u.sec();
		return (ts.$high > us.$high || (ts.$high === us.$high && ts.$low > us.$low)) || (ts.$high === us.$high && ts.$low === us.$low) && t.nsec() > u.nsec();
	};
	Time.prototype.After = function(u) { return this.$val.After(u); };
	Time.ptr.prototype.Before = function(u) {
		var t, u, x$1, x$10, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		t = this;
		if (!((x$1 = (x$2 = (x$3 = t.wall, x$4 = u.wall, new $Uint64(x$3.$high & x$4.$high, (x$3.$low & x$4.$low) >>> 0)), new $Uint64(x$2.$high & 2147483648, (x$2.$low & 0) >>> 0)), (x$1.$high === 0 && x$1.$low === 0)))) {
			return (x$5 = t.ext, x$6 = u.ext, (x$5.$high < x$6.$high || (x$5.$high === x$6.$high && x$5.$low < x$6.$low)));
		}
		return (x$7 = t.sec(), x$8 = u.sec(), (x$7.$high < x$8.$high || (x$7.$high === x$8.$high && x$7.$low < x$8.$low))) || (x$9 = t.sec(), x$10 = u.sec(), (x$9.$high === x$10.$high && x$9.$low === x$10.$low)) && t.nsec() < u.nsec();
	};
	Time.prototype.Before = function(u) { return this.$val.Before(u); };
	Time.ptr.prototype.Equal = function(u) {
		var t, u, x$1, x$2, x$3, x$4, x$5, x$6, x$7, x$8;
		t = this;
		if (!((x$1 = (x$2 = (x$3 = t.wall, x$4 = u.wall, new $Uint64(x$3.$high & x$4.$high, (x$3.$low & x$4.$low) >>> 0)), new $Uint64(x$2.$high & 2147483648, (x$2.$low & 0) >>> 0)), (x$1.$high === 0 && x$1.$low === 0)))) {
			return (x$5 = t.ext, x$6 = u.ext, (x$5.$high === x$6.$high && x$5.$low === x$6.$low));
		}
		return (x$7 = t.sec(), x$8 = u.sec(), (x$7.$high === x$8.$high && x$7.$low === x$8.$low)) && (t.nsec() === u.nsec());
	};
	Time.prototype.Equal = function(u) { return this.$val.Equal(u); };
	Month.prototype.String = function() {
		var buf, m, n, x$1;
		m = this.$val;
		if (1 <= m && m <= 12) {
			return (x$1 = m - 1 >> 0, ((x$1 < 0 || x$1 >= months.length) ? ($throwRuntimeError("index out of range"), undefined) : months[x$1]));
		}
		buf = $makeSlice(sliceType$3, 20);
		n = fmtInt(buf, (new $Uint64(0, m)));
		return "%!Month(" + ($bytesToString($subslice(buf, n))) + ")";
	};
	$ptrType(Month).prototype.String = function() { return new Month(this.$get()).String(); };
	Weekday.prototype.String = function() {
		var buf, d, n;
		d = this.$val;
		if (0 <= d && d <= 6) {
			return ((d < 0 || d >= days.length) ? ($throwRuntimeError("index out of range"), undefined) : days[d]);
		}
		buf = $makeSlice(sliceType$3, 20);
		n = fmtInt(buf, (new $Uint64(0, d)));
		return "%!Weekday(" + ($bytesToString($subslice(buf, n))) + ")";
	};
	$ptrType(Weekday).prototype.String = function() { return new Weekday(this.$get()).String(); };
	Time.ptr.prototype.IsZero = function() {
		var t, x$1;
		t = this;
		return (x$1 = t.sec(), (x$1.$high === 0 && x$1.$low === 0)) && (t.nsec() === 0);
	};
	Time.prototype.IsZero = function() { return this.$val.IsZero(); };
	Time.ptr.prototype.abs = function() {
		var _r, _r$1, _tuple, l, offset, sec, t, x$1, x$2, x$3, x$4, x$5, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _tuple = $f._tuple; l = $f.l; offset = $f.offset; sec = $f.sec; t = $f.t; x$1 = $f.x$1; x$2 = $f.x$2; x$3 = $f.x$3; x$4 = $f.x$4; x$5 = $f.x$5; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		l = t.loc;
		/* */ if (l === ptrType$2.nil || l === localLoc) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (l === ptrType$2.nil || l === localLoc) { */ case 1:
			_r = l.get(); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			l = _r;
		/* } */ case 2:
		sec = t.unixSec();
		/* */ if (!(l === utcLoc)) { $s = 4; continue; }
		/* */ $s = 5; continue;
		/* if (!(l === utcLoc)) { */ case 4:
			/* */ if (!(l.cacheZone === ptrType.nil) && (x$1 = l.cacheStart, (x$1.$high < sec.$high || (x$1.$high === sec.$high && x$1.$low <= sec.$low))) && (x$2 = l.cacheEnd, (sec.$high < x$2.$high || (sec.$high === x$2.$high && sec.$low < x$2.$low)))) { $s = 6; continue; }
			/* */ $s = 7; continue;
			/* if (!(l.cacheZone === ptrType.nil) && (x$1 = l.cacheStart, (x$1.$high < sec.$high || (x$1.$high === sec.$high && x$1.$low <= sec.$low))) && (x$2 = l.cacheEnd, (sec.$high < x$2.$high || (sec.$high === x$2.$high && sec.$low < x$2.$low)))) { */ case 6:
				sec = (x$3 = (new $Int64(0, l.cacheZone.offset)), new $Int64(sec.$high + x$3.$high, sec.$low + x$3.$low));
				$s = 8; continue;
			/* } else { */ case 7:
				_r$1 = l.lookup(sec); /* */ $s = 9; case 9: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				_tuple = _r$1;
				offset = _tuple[1];
				sec = (x$4 = (new $Int64(0, offset)), new $Int64(sec.$high + x$4.$high, sec.$low + x$4.$low));
			/* } */ case 8:
		/* } */ case 5:
		$s = -1; return ((x$5 = new $Int64(sec.$high + 2147483646, sec.$low + 450480384), new $Uint64(x$5.$high, x$5.$low)));
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.abs }; } $f._r = _r; $f._r$1 = _r$1; $f._tuple = _tuple; $f.l = l; $f.offset = offset; $f.sec = sec; $f.t = t; $f.x$1 = x$1; $f.x$2 = x$2; $f.x$3 = x$3; $f.x$4 = x$4; $f.x$5 = x$5; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.abs = function() { return this.$val.abs(); };
	Time.ptr.prototype.locabs = function() {
		var _r, _r$1, _tuple, abs, l, name, offset, sec, t, x$1, x$2, x$3, x$4, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _tuple = $f._tuple; abs = $f.abs; l = $f.l; name = $f.name; offset = $f.offset; sec = $f.sec; t = $f.t; x$1 = $f.x$1; x$2 = $f.x$2; x$3 = $f.x$3; x$4 = $f.x$4; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		name = "";
		offset = 0;
		abs = new $Uint64(0, 0);
		t = this;
		l = t.loc;
		/* */ if (l === ptrType$2.nil || l === localLoc) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (l === ptrType$2.nil || l === localLoc) { */ case 1:
			_r = l.get(); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			l = _r;
		/* } */ case 2:
		sec = t.unixSec();
		/* */ if (!(l === utcLoc)) { $s = 4; continue; }
		/* */ $s = 5; continue;
		/* if (!(l === utcLoc)) { */ case 4:
			/* */ if (!(l.cacheZone === ptrType.nil) && (x$1 = l.cacheStart, (x$1.$high < sec.$high || (x$1.$high === sec.$high && x$1.$low <= sec.$low))) && (x$2 = l.cacheEnd, (sec.$high < x$2.$high || (sec.$high === x$2.$high && sec.$low < x$2.$low)))) { $s = 7; continue; }
			/* */ $s = 8; continue;
			/* if (!(l.cacheZone === ptrType.nil) && (x$1 = l.cacheStart, (x$1.$high < sec.$high || (x$1.$high === sec.$high && x$1.$low <= sec.$low))) && (x$2 = l.cacheEnd, (sec.$high < x$2.$high || (sec.$high === x$2.$high && sec.$low < x$2.$low)))) { */ case 7:
				name = l.cacheZone.name;
				offset = l.cacheZone.offset;
				$s = 9; continue;
			/* } else { */ case 8:
				_r$1 = l.lookup(sec); /* */ $s = 10; case 10: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				_tuple = _r$1;
				name = _tuple[0];
				offset = _tuple[1];
			/* } */ case 9:
			sec = (x$3 = (new $Int64(0, offset)), new $Int64(sec.$high + x$3.$high, sec.$low + x$3.$low));
			$s = 6; continue;
		/* } else { */ case 5:
			name = "UTC";
		/* } */ case 6:
		abs = ((x$4 = new $Int64(sec.$high + 2147483646, sec.$low + 450480384), new $Uint64(x$4.$high, x$4.$low)));
		$s = -1; return [name, offset, abs];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.locabs }; } $f._r = _r; $f._r$1 = _r$1; $f._tuple = _tuple; $f.abs = abs; $f.l = l; $f.name = name; $f.offset = offset; $f.sec = sec; $f.t = t; $f.x$1 = x$1; $f.x$2 = x$2; $f.x$3 = x$3; $f.x$4 = x$4; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.locabs = function() { return this.$val.locabs(); };
	Time.ptr.prototype.Date = function() {
		var _r, _tuple, day, month, t, year, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; day = $f.day; month = $f.month; t = $f.t; year = $f.year; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		year = 0;
		month = 0;
		day = 0;
		t = this;
		_r = $clone(t, Time).date(true); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		year = _tuple[0];
		month = _tuple[1];
		day = _tuple[2];
		$s = -1; return [year, month, day];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.Date }; } $f._r = _r; $f._tuple = _tuple; $f.day = day; $f.month = month; $f.t = t; $f.year = year; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.Date = function() { return this.$val.Date(); };
	Time.ptr.prototype.Year = function() {
		var _r, _tuple, t, year, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; t = $f.t; year = $f.year; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).date(false); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		year = _tuple[0];
		$s = -1; return year;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.Year }; } $f._r = _r; $f._tuple = _tuple; $f.t = t; $f.year = year; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.Year = function() { return this.$val.Year(); };
	Time.ptr.prototype.Month = function() {
		var _r, _tuple, month, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; month = $f.month; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).date(true); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		month = _tuple[1];
		$s = -1; return month;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.Month }; } $f._r = _r; $f._tuple = _tuple; $f.month = month; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.Month = function() { return this.$val.Month(); };
	Time.ptr.prototype.Day = function() {
		var _r, _tuple, day, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; day = $f.day; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).date(true); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		day = _tuple[2];
		$s = -1; return day;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.Day }; } $f._r = _r; $f._tuple = _tuple; $f.day = day; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.Day = function() { return this.$val.Day(); };
	Time.ptr.prototype.Weekday = function() {
		var _r, _r$1, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).abs(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_r$1 = absWeekday(_r); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		$s = -1; return _r$1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.Weekday }; } $f._r = _r; $f._r$1 = _r$1; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.Weekday = function() { return this.$val.Weekday(); };
	absWeekday = function(abs) {
		var _q, abs, sec;
		sec = $div64((new $Uint64(abs.$high + 0, abs.$low + 86400)), new $Uint64(0, 604800), true);
		return (((_q = ((sec.$low >> 0)) / 86400, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0));
	};
	Time.ptr.prototype.ISOWeek = function() {
		var _q, _r, _r$1, _r$2, _r$3, _r$4, _tuple, day, dec31wday, jan1wday, month, t, wday, week, yday, year, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _q = $f._q; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _tuple = $f._tuple; day = $f.day; dec31wday = $f.dec31wday; jan1wday = $f.jan1wday; month = $f.month; t = $f.t; wday = $f.wday; week = $f.week; yday = $f.yday; year = $f.year; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		year = 0;
		week = 0;
		t = this;
		_r = $clone(t, Time).date(true); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		year = _tuple[0];
		month = _tuple[1];
		day = _tuple[2];
		yday = _tuple[3];
		_r$2 = $clone(t, Time).Weekday(); /* */ $s = 2; case 2: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		wday = (_r$1 = (((_r$2 + 6 >> 0) >> 0)) % 7, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero"));
		week = (_q = (((yday - wday >> 0) + 7 >> 0)) / 7, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		jan1wday = (_r$3 = (((wday - yday >> 0) + 371 >> 0)) % 7, _r$3 === _r$3 ? _r$3 : $throwRuntimeError("integer divide by zero"));
		if (1 <= jan1wday && jan1wday <= 3) {
			week = week + (1) >> 0;
		}
		if (week === 0) {
			year = year - (1) >> 0;
			week = 52;
			if ((jan1wday === 4) || ((jan1wday === 5) && isLeap(year))) {
				week = week + (1) >> 0;
			}
		}
		if ((month === 12) && day >= 29 && wday < 3) {
			dec31wday = (_r$4 = (((wday + 31 >> 0) - day >> 0)) % 7, _r$4 === _r$4 ? _r$4 : $throwRuntimeError("integer divide by zero"));
			if (0 <= dec31wday && dec31wday <= 2) {
				year = year + (1) >> 0;
				week = 1;
			}
		}
		$s = -1; return [year, week];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.ISOWeek }; } $f._q = _q; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._tuple = _tuple; $f.day = day; $f.dec31wday = dec31wday; $f.jan1wday = jan1wday; $f.month = month; $f.t = t; $f.wday = wday; $f.week = week; $f.yday = yday; $f.year = year; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.ISOWeek = function() { return this.$val.ISOWeek(); };
	Time.ptr.prototype.Clock = function() {
		var _r, _r$1, _tuple, hour, min, sec, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _tuple = $f._tuple; hour = $f.hour; min = $f.min; sec = $f.sec; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		hour = 0;
		min = 0;
		sec = 0;
		t = this;
		_r = $clone(t, Time).abs(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_r$1 = absClock(_r); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_tuple = _r$1;
		hour = _tuple[0];
		min = _tuple[1];
		sec = _tuple[2];
		$s = -1; return [hour, min, sec];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.Clock }; } $f._r = _r; $f._r$1 = _r$1; $f._tuple = _tuple; $f.hour = hour; $f.min = min; $f.sec = sec; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.Clock = function() { return this.$val.Clock(); };
	absClock = function(abs) {
		var _q, _q$1, abs, hour, min, sec;
		hour = 0;
		min = 0;
		sec = 0;
		sec = (($div64(abs, new $Uint64(0, 86400), true).$low >> 0));
		hour = (_q = sec / 3600, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		sec = sec - (($imul(hour, 3600))) >> 0;
		min = (_q$1 = sec / 60, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero"));
		sec = sec - (($imul(min, 60))) >> 0;
		return [hour, min, sec];
	};
	Time.ptr.prototype.Hour = function() {
		var _q, _r, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _q = $f._q; _r = $f._r; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).abs(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return (_q = (($div64(_r, new $Uint64(0, 86400), true).$low >> 0)) / 3600, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.Hour }; } $f._q = _q; $f._r = _r; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.Hour = function() { return this.$val.Hour(); };
	Time.ptr.prototype.Minute = function() {
		var _q, _r, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _q = $f._q; _r = $f._r; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).abs(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return (_q = (($div64(_r, new $Uint64(0, 3600), true).$low >> 0)) / 60, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.Minute }; } $f._q = _q; $f._r = _r; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.Minute = function() { return this.$val.Minute(); };
	Time.ptr.prototype.Second = function() {
		var _r, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).abs(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return (($div64(_r, new $Uint64(0, 60), true).$low >> 0));
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.Second }; } $f._r = _r; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.Second = function() { return this.$val.Second(); };
	Time.ptr.prototype.Nanosecond = function() {
		var t;
		t = this;
		return ((t.nsec() >> 0));
	};
	Time.prototype.Nanosecond = function() { return this.$val.Nanosecond(); };
	Time.ptr.prototype.YearDay = function() {
		var _r, _tuple, t, yday, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; t = $f.t; yday = $f.yday; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).date(false); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		yday = _tuple[3];
		$s = -1; return yday + 1 >> 0;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.YearDay }; } $f._r = _r; $f._tuple = _tuple; $f.t = t; $f.yday = yday; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.YearDay = function() { return this.$val.YearDay(); };
	Duration.prototype.String = function() {
		var _tuple, _tuple$1, buf, d, neg, prec, u, w;
		d = this;
		buf = arrayType$3.zero();
		w = 32;
		u = (new $Uint64(d.$high, d.$low));
		neg = (d.$high < 0 || (d.$high === 0 && d.$low < 0));
		if (neg) {
			u = new $Uint64(-u.$high, -u.$low);
		}
		if ((u.$high < 0 || (u.$high === 0 && u.$low < 1000000000))) {
			prec = 0;
			w = w - (1) >> 0;
			((w < 0 || w >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[w] = 115);
			w = w - (1) >> 0;
			if ((u.$high === 0 && u.$low === 0)) {
				return "0s";
			} else if ((u.$high < 0 || (u.$high === 0 && u.$low < 1000))) {
				prec = 0;
				((w < 0 || w >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[w] = 110);
			} else if ((u.$high < 0 || (u.$high === 0 && u.$low < 1000000))) {
				prec = 3;
				w = w - (1) >> 0;
				$copyString($subslice(new sliceType$3(buf), w), "\xC2\xB5");
			} else {
				prec = 6;
				((w < 0 || w >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[w] = 109);
			}
			_tuple = fmtFrac($subslice(new sliceType$3(buf), 0, w), u, prec);
			w = _tuple[0];
			u = _tuple[1];
			w = fmtInt($subslice(new sliceType$3(buf), 0, w), u);
		} else {
			w = w - (1) >> 0;
			((w < 0 || w >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[w] = 115);
			_tuple$1 = fmtFrac($subslice(new sliceType$3(buf), 0, w), u, 9);
			w = _tuple$1[0];
			u = _tuple$1[1];
			w = fmtInt($subslice(new sliceType$3(buf), 0, w), $div64(u, new $Uint64(0, 60), true));
			u = $div64(u, (new $Uint64(0, 60)), false);
			if ((u.$high > 0 || (u.$high === 0 && u.$low > 0))) {
				w = w - (1) >> 0;
				((w < 0 || w >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[w] = 109);
				w = fmtInt($subslice(new sliceType$3(buf), 0, w), $div64(u, new $Uint64(0, 60), true));
				u = $div64(u, (new $Uint64(0, 60)), false);
				if ((u.$high > 0 || (u.$high === 0 && u.$low > 0))) {
					w = w - (1) >> 0;
					((w < 0 || w >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[w] = 104);
					w = fmtInt($subslice(new sliceType$3(buf), 0, w), u);
				}
			}
		}
		if (neg) {
			w = w - (1) >> 0;
			((w < 0 || w >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[w] = 45);
		}
		return ($bytesToString($subslice(new sliceType$3(buf), w)));
	};
	$ptrType(Duration).prototype.String = function() { return this.$get().String(); };
	fmtFrac = function(buf, v, prec) {
		var _tmp, _tmp$1, buf, digit, i, nv, nw, prec, print, v, w;
		nw = 0;
		nv = new $Uint64(0, 0);
		w = buf.$length;
		print = false;
		i = 0;
		while (true) {
			if (!(i < prec)) { break; }
			digit = $div64(v, new $Uint64(0, 10), true);
			print = print || !((digit.$high === 0 && digit.$low === 0));
			if (print) {
				w = w - (1) >> 0;
				((w < 0 || w >= buf.$length) ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + w] = (((digit.$low << 24 >>> 24)) + 48 << 24 >>> 24));
			}
			v = $div64(v, (new $Uint64(0, 10)), false);
			i = i + (1) >> 0;
		}
		if (print) {
			w = w - (1) >> 0;
			((w < 0 || w >= buf.$length) ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + w] = 46);
		}
		_tmp = w;
		_tmp$1 = v;
		nw = _tmp;
		nv = _tmp$1;
		return [nw, nv];
	};
	fmtInt = function(buf, v) {
		var buf, v, w;
		w = buf.$length;
		if ((v.$high === 0 && v.$low === 0)) {
			w = w - (1) >> 0;
			((w < 0 || w >= buf.$length) ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + w] = 48);
		} else {
			while (true) {
				if (!((v.$high > 0 || (v.$high === 0 && v.$low > 0)))) { break; }
				w = w - (1) >> 0;
				((w < 0 || w >= buf.$length) ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + w] = ((($div64(v, new $Uint64(0, 10), true).$low << 24 >>> 24)) + 48 << 24 >>> 24));
				v = $div64(v, (new $Uint64(0, 10)), false);
			}
		}
		return w;
	};
	Duration.prototype.Nanoseconds = function() {
		var d;
		d = this;
		return (new $Int64(d.$high, d.$low));
	};
	$ptrType(Duration).prototype.Nanoseconds = function() { return this.$get().Nanoseconds(); };
	Duration.prototype.Seconds = function() {
		var d, nsec, sec;
		d = this;
		sec = $div64(d, new Duration(0, 1000000000), false);
		nsec = $div64(d, new Duration(0, 1000000000), true);
		return ($flatten64(sec)) + ($flatten64(nsec)) / 1e+09;
	};
	$ptrType(Duration).prototype.Seconds = function() { return this.$get().Seconds(); };
	Duration.prototype.Minutes = function() {
		var d, min, nsec;
		d = this;
		min = $div64(d, new Duration(13, 4165425152), false);
		nsec = $div64(d, new Duration(13, 4165425152), true);
		return ($flatten64(min)) + ($flatten64(nsec)) / 6e+10;
	};
	$ptrType(Duration).prototype.Minutes = function() { return this.$get().Minutes(); };
	Duration.prototype.Hours = function() {
		var d, hour, nsec;
		d = this;
		hour = $div64(d, new Duration(838, 817405952), false);
		nsec = $div64(d, new Duration(838, 817405952), true);
		return ($flatten64(hour)) + ($flatten64(nsec)) / 3.6e+12;
	};
	$ptrType(Duration).prototype.Hours = function() { return this.$get().Hours(); };
	Duration.prototype.Truncate = function(m) {
		var d, m, x$1;
		d = this;
		if ((m.$high < 0 || (m.$high === 0 && m.$low <= 0))) {
			return d;
		}
		return (x$1 = $div64(d, m, true), new Duration(d.$high - x$1.$high, d.$low - x$1.$low));
	};
	$ptrType(Duration).prototype.Truncate = function(m) { return this.$get().Truncate(m); };
	lessThanHalf = function(x$1, y) {
		var x$1, x$2, x$3, x$4, x$5, y;
		return (x$2 = (x$3 = (new $Uint64(x$1.$high, x$1.$low)), x$4 = (new $Uint64(x$1.$high, x$1.$low)), new $Uint64(x$3.$high + x$4.$high, x$3.$low + x$4.$low)), x$5 = (new $Uint64(y.$high, y.$low)), (x$2.$high < x$5.$high || (x$2.$high === x$5.$high && x$2.$low < x$5.$low)));
	};
	Duration.prototype.Round = function(m) {
		var d, d1, d1$1, m, r, x$1, x$2;
		d = this;
		if ((m.$high < 0 || (m.$high === 0 && m.$low <= 0))) {
			return d;
		}
		r = $div64(d, m, true);
		if ((d.$high < 0 || (d.$high === 0 && d.$low < 0))) {
			r = new Duration(-r.$high, -r.$low);
			if (lessThanHalf(r, m)) {
				return new Duration(d.$high + r.$high, d.$low + r.$low);
			}
			d1 = (x$1 = new Duration(d.$high - m.$high, d.$low - m.$low), new Duration(x$1.$high + r.$high, x$1.$low + r.$low));
			if ((d1.$high < d.$high || (d1.$high === d.$high && d1.$low < d.$low))) {
				return d1;
			}
			return new Duration(-2147483648, 0);
		}
		if (lessThanHalf(r, m)) {
			return new Duration(d.$high - r.$high, d.$low - r.$low);
		}
		d1$1 = (x$2 = new Duration(d.$high + m.$high, d.$low + m.$low), new Duration(x$2.$high - r.$high, x$2.$low - r.$low));
		if ((d1$1.$high > d.$high || (d1$1.$high === d.$high && d1$1.$low > d.$low))) {
			return d1$1;
		}
		return new Duration(2147483647, 4294967295);
	};
	$ptrType(Duration).prototype.Round = function(m) { return this.$get().Round(m); };
	Time.ptr.prototype.Add = function(d) {
		var d, dsec, nsec, t, te, x$1, x$10, x$11, x$12, x$13, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		t = this;
		dsec = ((x$1 = $div64(d, new Duration(0, 1000000000), false), new $Int64(x$1.$high, x$1.$low)));
		nsec = t.nsec() + (((x$2 = $div64(d, new Duration(0, 1000000000), true), x$2.$low + ((x$2.$high >> 31) * 4294967296)) >> 0)) >> 0;
		if (nsec >= 1000000000) {
			dsec = (x$3 = new $Int64(0, 1), new $Int64(dsec.$high + x$3.$high, dsec.$low + x$3.$low));
			nsec = nsec - (1000000000) >> 0;
		} else if (nsec < 0) {
			dsec = (x$4 = new $Int64(0, 1), new $Int64(dsec.$high - x$4.$high, dsec.$low - x$4.$low));
			nsec = nsec + (1000000000) >> 0;
		}
		t.wall = (x$5 = (x$6 = t.wall, new $Uint64(x$6.$high & ~0, (x$6.$low & ~1073741823) >>> 0)), x$7 = (new $Uint64(0, nsec)), new $Uint64(x$5.$high | x$7.$high, (x$5.$low | x$7.$low) >>> 0));
		t.addSec(dsec);
		if (!((x$8 = (x$9 = t.wall, new $Uint64(x$9.$high & 2147483648, (x$9.$low & 0) >>> 0)), (x$8.$high === 0 && x$8.$low === 0)))) {
			te = (x$10 = t.ext, x$11 = (new $Int64(d.$high, d.$low)), new $Int64(x$10.$high + x$11.$high, x$10.$low + x$11.$low));
			if ((d.$high < 0 || (d.$high === 0 && d.$low < 0)) && (x$12 = t.ext, (te.$high > x$12.$high || (te.$high === x$12.$high && te.$low > x$12.$low))) || (d.$high > 0 || (d.$high === 0 && d.$low > 0)) && (x$13 = t.ext, (te.$high < x$13.$high || (te.$high === x$13.$high && te.$low < x$13.$low)))) {
				t.stripMono();
			} else {
				t.ext = te;
			}
		}
		return t;
	};
	Time.prototype.Add = function(d) { return this.$val.Add(d); };
	Time.ptr.prototype.Sub = function(u) {
		var d, d$1, t, te, u, ue, x$1, x$10, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		t = this;
		if (!((x$1 = (x$2 = (x$3 = t.wall, x$4 = u.wall, new $Uint64(x$3.$high & x$4.$high, (x$3.$low & x$4.$low) >>> 0)), new $Uint64(x$2.$high & 2147483648, (x$2.$low & 0) >>> 0)), (x$1.$high === 0 && x$1.$low === 0)))) {
			te = t.ext;
			ue = u.ext;
			d = ((x$5 = new $Int64(te.$high - ue.$high, te.$low - ue.$low), new Duration(x$5.$high, x$5.$low)));
			if ((d.$high < 0 || (d.$high === 0 && d.$low < 0)) && (te.$high > ue.$high || (te.$high === ue.$high && te.$low > ue.$low))) {
				return new Duration(2147483647, 4294967295);
			}
			if ((d.$high > 0 || (d.$high === 0 && d.$low > 0)) && (te.$high < ue.$high || (te.$high === ue.$high && te.$low < ue.$low))) {
				return new Duration(-2147483648, 0);
			}
			return d;
		}
		d$1 = (x$6 = $mul64(((x$7 = (x$8 = t.sec(), x$9 = u.sec(), new $Int64(x$8.$high - x$9.$high, x$8.$low - x$9.$low)), new Duration(x$7.$high, x$7.$low))), new Duration(0, 1000000000)), x$10 = (new Duration(0, (t.nsec() - u.nsec() >> 0))), new Duration(x$6.$high + x$10.$high, x$6.$low + x$10.$low));
		if ($clone($clone(u, Time).Add(d$1), Time).Equal($clone(t, Time))) {
			return d$1;
		} else if ($clone(t, Time).Before($clone(u, Time))) {
			return new Duration(-2147483648, 0);
		} else {
			return new Duration(2147483647, 4294967295);
		}
	};
	Time.prototype.Sub = function(u) { return this.$val.Sub(u); };
	Time.ptr.prototype.AddDate = function(years, months$1, days$1) {
		var _r, _r$1, _r$2, _tuple, _tuple$1, day, days$1, hour, min, month, months$1, sec, t, year, years, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _tuple = $f._tuple; _tuple$1 = $f._tuple$1; day = $f.day; days$1 = $f.days$1; hour = $f.hour; min = $f.min; month = $f.month; months$1 = $f.months$1; sec = $f.sec; t = $f.t; year = $f.year; years = $f.years; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).Date(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		year = _tuple[0];
		month = _tuple[1];
		day = _tuple[2];
		_r$1 = $clone(t, Time).Clock(); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_tuple$1 = _r$1;
		hour = _tuple$1[0];
		min = _tuple$1[1];
		sec = _tuple$1[2];
		_r$2 = Date(year + years >> 0, month + ((months$1 >> 0)) >> 0, day + days$1 >> 0, hour, min, sec, ((t.nsec() >> 0)), $clone(t, Time).Location()); /* */ $s = 3; case 3: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		$s = -1; return _r$2;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.AddDate }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._tuple = _tuple; $f._tuple$1 = _tuple$1; $f.day = day; $f.days$1 = days$1; $f.hour = hour; $f.min = min; $f.month = month; $f.months$1 = months$1; $f.sec = sec; $f.t = t; $f.year = year; $f.years = years; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.AddDate = function(years, months$1, days$1) { return this.$val.AddDate(years, months$1, days$1); };
	Time.ptr.prototype.date = function(full) {
		var _r, _r$1, _tuple, day, full, month, t, yday, year, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _tuple = $f._tuple; day = $f.day; full = $f.full; month = $f.month; t = $f.t; yday = $f.yday; year = $f.year; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		year = 0;
		month = 0;
		day = 0;
		yday = 0;
		t = this;
		_r = $clone(t, Time).abs(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_r$1 = absDate(_r, full); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_tuple = _r$1;
		year = _tuple[0];
		month = _tuple[1];
		day = _tuple[2];
		yday = _tuple[3];
		$s = -1; return [year, month, day, yday];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.date }; } $f._r = _r; $f._r$1 = _r$1; $f._tuple = _tuple; $f.day = day; $f.full = full; $f.month = month; $f.t = t; $f.yday = yday; $f.year = year; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.date = function(full) { return this.$val.date(full); };
	absDate = function(abs, full) {
		var _q, abs, begin, d, day, end, full, month, n, x$1, x$10, x$11, x$12, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, y, yday, year;
		year = 0;
		month = 0;
		day = 0;
		yday = 0;
		d = $div64(abs, new $Uint64(0, 86400), false);
		n = $div64(d, new $Uint64(0, 146097), false);
		y = $mul64(new $Uint64(0, 400), n);
		d = (x$1 = $mul64(new $Uint64(0, 146097), n), new $Uint64(d.$high - x$1.$high, d.$low - x$1.$low));
		n = $div64(d, new $Uint64(0, 36524), false);
		n = (x$2 = $shiftRightUint64(n, 2), new $Uint64(n.$high - x$2.$high, n.$low - x$2.$low));
		y = (x$3 = $mul64(new $Uint64(0, 100), n), new $Uint64(y.$high + x$3.$high, y.$low + x$3.$low));
		d = (x$4 = $mul64(new $Uint64(0, 36524), n), new $Uint64(d.$high - x$4.$high, d.$low - x$4.$low));
		n = $div64(d, new $Uint64(0, 1461), false);
		y = (x$5 = $mul64(new $Uint64(0, 4), n), new $Uint64(y.$high + x$5.$high, y.$low + x$5.$low));
		d = (x$6 = $mul64(new $Uint64(0, 1461), n), new $Uint64(d.$high - x$6.$high, d.$low - x$6.$low));
		n = $div64(d, new $Uint64(0, 365), false);
		n = (x$7 = $shiftRightUint64(n, 2), new $Uint64(n.$high - x$7.$high, n.$low - x$7.$low));
		y = (x$8 = n, new $Uint64(y.$high + x$8.$high, y.$low + x$8.$low));
		d = (x$9 = $mul64(new $Uint64(0, 365), n), new $Uint64(d.$high - x$9.$high, d.$low - x$9.$low));
		year = (((x$10 = (x$11 = (new $Int64(y.$high, y.$low)), new $Int64(x$11.$high + -69, x$11.$low + 4075721025)), x$10.$low + ((x$10.$high >> 31) * 4294967296)) >> 0));
		yday = ((d.$low >> 0));
		if (!full) {
			return [year, month, day, yday];
		}
		day = yday;
		if (isLeap(year)) {
			if (day > 59) {
				day = day - (1) >> 0;
			} else if ((day === 59)) {
				month = 2;
				day = 29;
				return [year, month, day, yday];
			}
		}
		month = (((_q = day / 31, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0));
		end = (((x$12 = month + 1 >> 0, ((x$12 < 0 || x$12 >= daysBefore.length) ? ($throwRuntimeError("index out of range"), undefined) : daysBefore[x$12])) >> 0));
		begin = 0;
		if (day >= end) {
			month = month + (1) >> 0;
			begin = end;
		} else {
			begin = ((((month < 0 || month >= daysBefore.length) ? ($throwRuntimeError("index out of range"), undefined) : daysBefore[month]) >> 0));
		}
		month = month + (1) >> 0;
		day = (day - begin >> 0) + 1 >> 0;
		return [year, month, day, yday];
	};
	daysIn = function(m, year) {
		var m, x$1, year;
		if ((m === 2) && isLeap(year)) {
			return 29;
		}
		return (((((m < 0 || m >= daysBefore.length) ? ($throwRuntimeError("index out of range"), undefined) : daysBefore[m]) - (x$1 = m - 1 >> 0, ((x$1 < 0 || x$1 >= daysBefore.length) ? ($throwRuntimeError("index out of range"), undefined) : daysBefore[x$1])) >> 0) >> 0));
	};
	unixTime = function(sec, nsec) {
		var nsec, sec;
		return new Time.ptr((new $Uint64(0, nsec)), new $Int64(sec.$high + 14, sec.$low + 2006054656), $pkg.Local);
	};
	Time.ptr.prototype.UTC = function() {
		var t;
		t = this;
		t.setLoc(utcLoc);
		return t;
	};
	Time.prototype.UTC = function() { return this.$val.UTC(); };
	Time.ptr.prototype.Local = function() {
		var t;
		t = this;
		t.setLoc($pkg.Local);
		return t;
	};
	Time.prototype.Local = function() { return this.$val.Local(); };
	Time.ptr.prototype.In = function(loc) {
		var loc, t;
		t = this;
		if (loc === ptrType$2.nil) {
			$panic(new $String("time: missing Location in call to Time.In"));
		}
		t.setLoc(loc);
		return t;
	};
	Time.prototype.In = function(loc) { return this.$val.In(loc); };
	Time.ptr.prototype.Location = function() {
		var l, t;
		t = this;
		l = t.loc;
		if (l === ptrType$2.nil) {
			l = $pkg.UTC;
		}
		return l;
	};
	Time.prototype.Location = function() { return this.$val.Location(); };
	Time.ptr.prototype.Zone = function() {
		var _r, _tuple, name, offset, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; name = $f.name; offset = $f.offset; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		name = "";
		offset = 0;
		t = this;
		_r = t.loc.lookup(t.unixSec()); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		name = _tuple[0];
		offset = _tuple[1];
		$s = -1; return [name, offset];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.Zone }; } $f._r = _r; $f._tuple = _tuple; $f.name = name; $f.offset = offset; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.Zone = function() { return this.$val.Zone(); };
	Time.ptr.prototype.Unix = function() {
		var t;
		t = this;
		return t.unixSec();
	};
	Time.prototype.Unix = function() { return this.$val.Unix(); };
	Time.ptr.prototype.UnixNano = function() {
		var t, x$1, x$2;
		t = this;
		return (x$1 = $mul64((t.unixSec()), new $Int64(0, 1000000000)), x$2 = (new $Int64(0, t.nsec())), new $Int64(x$1.$high + x$2.$high, x$1.$low + x$2.$low));
	};
	Time.prototype.UnixNano = function() { return this.$val.UnixNano(); };
	Time.ptr.prototype.MarshalBinary = function() {
		var _q, _r, _r$1, _tuple, enc, nsec, offset, offsetMin, sec, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _q = $f._q; _r = $f._r; _r$1 = $f._r$1; _tuple = $f._tuple; enc = $f.enc; nsec = $f.nsec; offset = $f.offset; offsetMin = $f.offsetMin; sec = $f.sec; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		offsetMin = 0;
		/* */ if ($clone(t, Time).Location() === $pkg.UTC) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if ($clone(t, Time).Location() === $pkg.UTC) { */ case 1:
			offsetMin = -1;
			$s = 3; continue;
		/* } else { */ case 2:
			_r = $clone(t, Time).Zone(); /* */ $s = 4; case 4: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_tuple = _r;
			offset = _tuple[1];
			if (!(((_r$1 = offset % 60, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) === 0))) {
				$s = -1; return [sliceType$3.nil, errors.New("Time.MarshalBinary: zone offset has fractional minute")];
			}
			offset = (_q = offset / (60), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
			if (offset < -32768 || (offset === -1) || offset > 32767) {
				$s = -1; return [sliceType$3.nil, errors.New("Time.MarshalBinary: unexpected zone offset")];
			}
			offsetMin = ((offset << 16 >> 16));
		/* } */ case 3:
		sec = t.sec();
		nsec = t.nsec();
		enc = new sliceType$3([1, (($shiftRightInt64(sec, 56).$low << 24 >>> 24)), (($shiftRightInt64(sec, 48).$low << 24 >>> 24)), (($shiftRightInt64(sec, 40).$low << 24 >>> 24)), (($shiftRightInt64(sec, 32).$low << 24 >>> 24)), (($shiftRightInt64(sec, 24).$low << 24 >>> 24)), (($shiftRightInt64(sec, 16).$low << 24 >>> 24)), (($shiftRightInt64(sec, 8).$low << 24 >>> 24)), ((sec.$low << 24 >>> 24)), (((nsec >> 24 >> 0) << 24 >>> 24)), (((nsec >> 16 >> 0) << 24 >>> 24)), (((nsec >> 8 >> 0) << 24 >>> 24)), ((nsec << 24 >>> 24)), (((offsetMin >> 8 << 16 >> 16) << 24 >>> 24)), ((offsetMin << 24 >>> 24))]);
		$s = -1; return [enc, $ifaceNil];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.MarshalBinary }; } $f._q = _q; $f._r = _r; $f._r$1 = _r$1; $f._tuple = _tuple; $f.enc = enc; $f.nsec = nsec; $f.offset = offset; $f.offsetMin = offsetMin; $f.sec = sec; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.MarshalBinary = function() { return this.$val.MarshalBinary(); };
	Time.ptr.prototype.UnmarshalBinary = function(data) {
		var _r, _tuple, buf, data, localoff, nsec, offset, sec, t, x$1, x$10, x$11, x$12, x$13, x$14, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; buf = $f.buf; data = $f.data; localoff = $f.localoff; nsec = $f.nsec; offset = $f.offset; sec = $f.sec; t = $f.t; x$1 = $f.x$1; x$10 = $f.x$10; x$11 = $f.x$11; x$12 = $f.x$12; x$13 = $f.x$13; x$14 = $f.x$14; x$2 = $f.x$2; x$3 = $f.x$3; x$4 = $f.x$4; x$5 = $f.x$5; x$6 = $f.x$6; x$7 = $f.x$7; x$8 = $f.x$8; x$9 = $f.x$9; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		buf = data;
		if (buf.$length === 0) {
			$s = -1; return errors.New("Time.UnmarshalBinary: no data");
		}
		if (!(((0 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 0]) === 1))) {
			$s = -1; return errors.New("Time.UnmarshalBinary: unsupported version");
		}
		if (!((buf.$length === 15))) {
			$s = -1; return errors.New("Time.UnmarshalBinary: invalid length");
		}
		buf = $subslice(buf, 1);
		sec = (x$1 = (x$2 = (x$3 = (x$4 = (x$5 = (x$6 = (x$7 = (new $Int64(0, (7 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 7]))), x$8 = $shiftLeft64((new $Int64(0, (6 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 6]))), 8), new $Int64(x$7.$high | x$8.$high, (x$7.$low | x$8.$low) >>> 0)), x$9 = $shiftLeft64((new $Int64(0, (5 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 5]))), 16), new $Int64(x$6.$high | x$9.$high, (x$6.$low | x$9.$low) >>> 0)), x$10 = $shiftLeft64((new $Int64(0, (4 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 4]))), 24), new $Int64(x$5.$high | x$10.$high, (x$5.$low | x$10.$low) >>> 0)), x$11 = $shiftLeft64((new $Int64(0, (3 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 3]))), 32), new $Int64(x$4.$high | x$11.$high, (x$4.$low | x$11.$low) >>> 0)), x$12 = $shiftLeft64((new $Int64(0, (2 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 2]))), 40), new $Int64(x$3.$high | x$12.$high, (x$3.$low | x$12.$low) >>> 0)), x$13 = $shiftLeft64((new $Int64(0, (1 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 1]))), 48), new $Int64(x$2.$high | x$13.$high, (x$2.$low | x$13.$low) >>> 0)), x$14 = $shiftLeft64((new $Int64(0, (0 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 0]))), 56), new $Int64(x$1.$high | x$14.$high, (x$1.$low | x$14.$low) >>> 0));
		buf = $subslice(buf, 8);
		nsec = (((((3 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 3]) >> 0)) | ((((2 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 2]) >> 0)) << 8 >> 0)) | ((((1 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 1]) >> 0)) << 16 >> 0)) | ((((0 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 0]) >> 0)) << 24 >> 0);
		buf = $subslice(buf, 4);
		offset = $imul(((((((1 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 1]) << 16 >> 16)) | ((((0 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 0]) << 16 >> 16)) << 8 << 16 >> 16)) >> 0)), 60);
		Time.copy(t, new Time.ptr(new $Uint64(0, 0), new $Int64(0, 0), ptrType$2.nil));
		t.wall = (new $Uint64(0, nsec));
		t.ext = sec;
		/* */ if (offset === -60) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (offset === -60) { */ case 1:
			t.setLoc(utcLoc);
			$s = 3; continue;
		/* } else { */ case 2:
			_r = $pkg.Local.lookup(t.unixSec()); /* */ $s = 4; case 4: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_tuple = _r;
			localoff = _tuple[1];
			if (offset === localoff) {
				t.setLoc($pkg.Local);
			} else {
				t.setLoc(FixedZone("", offset));
			}
		/* } */ case 3:
		$s = -1; return $ifaceNil;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.UnmarshalBinary }; } $f._r = _r; $f._tuple = _tuple; $f.buf = buf; $f.data = data; $f.localoff = localoff; $f.nsec = nsec; $f.offset = offset; $f.sec = sec; $f.t = t; $f.x$1 = x$1; $f.x$10 = x$10; $f.x$11 = x$11; $f.x$12 = x$12; $f.x$13 = x$13; $f.x$14 = x$14; $f.x$2 = x$2; $f.x$3 = x$3; $f.x$4 = x$4; $f.x$5 = x$5; $f.x$6 = x$6; $f.x$7 = x$7; $f.x$8 = x$8; $f.x$9 = x$9; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.UnmarshalBinary = function(data) { return this.$val.UnmarshalBinary(data); };
	Time.ptr.prototype.GobEncode = function() {
		var _r, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).MarshalBinary(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.GobEncode }; } $f._r = _r; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.GobEncode = function() { return this.$val.GobEncode(); };
	Time.ptr.prototype.GobDecode = function(data) {
		var _r, data, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; data = $f.data; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = t.UnmarshalBinary(data); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.GobDecode }; } $f._r = _r; $f.data = data; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.GobDecode = function(data) { return this.$val.GobDecode(data); };
	Time.ptr.prototype.MarshalJSON = function() {
		var _r, _r$1, b, t, y, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; b = $f.b; t = $f.t; y = $f.y; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).Year(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		y = _r;
		if (y < 0 || y >= 10000) {
			$s = -1; return [sliceType$3.nil, errors.New("Time.MarshalJSON: year outside of range [0,9999]")];
		}
		b = $makeSlice(sliceType$3, 0, 37);
		b = $append(b, 34);
		_r$1 = $clone(t, Time).AppendFormat(b, "2006-01-02T15:04:05.999999999Z07:00"); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		b = _r$1;
		b = $append(b, 34);
		$s = -1; return [b, $ifaceNil];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.MarshalJSON }; } $f._r = _r; $f._r$1 = _r$1; $f.b = b; $f.t = t; $f.y = y; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.MarshalJSON = function() { return this.$val.MarshalJSON(); };
	Time.ptr.prototype.UnmarshalJSON = function(data) {
		var _r, _tuple, data, err, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; data = $f.data; err = $f.err; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		if (($bytesToString(data)) === "null") {
			$s = -1; return $ifaceNil;
		}
		err = $ifaceNil;
		_r = Parse("\"2006-01-02T15:04:05Z07:00\"", ($bytesToString(data))); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		Time.copy(t, _tuple[0]);
		err = _tuple[1];
		$s = -1; return err;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.UnmarshalJSON }; } $f._r = _r; $f._tuple = _tuple; $f.data = data; $f.err = err; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.UnmarshalJSON = function(data) { return this.$val.UnmarshalJSON(data); };
	Time.ptr.prototype.MarshalText = function() {
		var _r, _r$1, b, t, y, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; b = $f.b; t = $f.t; y = $f.y; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).Year(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		y = _r;
		if (y < 0 || y >= 10000) {
			$s = -1; return [sliceType$3.nil, errors.New("Time.MarshalText: year outside of range [0,9999]")];
		}
		b = $makeSlice(sliceType$3, 0, 35);
		_r$1 = $clone(t, Time).AppendFormat(b, "2006-01-02T15:04:05.999999999Z07:00"); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		$s = -1; return [_r$1, $ifaceNil];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.MarshalText }; } $f._r = _r; $f._r$1 = _r$1; $f.b = b; $f.t = t; $f.y = y; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.MarshalText = function() { return this.$val.MarshalText(); };
	Time.ptr.prototype.UnmarshalText = function(data) {
		var _r, _tuple, data, err, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; data = $f.data; err = $f.err; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		err = $ifaceNil;
		_r = Parse("2006-01-02T15:04:05Z07:00", ($bytesToString(data))); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		Time.copy(t, _tuple[0]);
		err = _tuple[1];
		$s = -1; return err;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.UnmarshalText }; } $f._r = _r; $f._tuple = _tuple; $f.data = data; $f.err = err; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.UnmarshalText = function(data) { return this.$val.UnmarshalText(data); };
	Unix = function(sec, nsec) {
		var n, nsec, sec, x$1, x$2, x$3, x$4;
		if ((nsec.$high < 0 || (nsec.$high === 0 && nsec.$low < 0)) || (nsec.$high > 0 || (nsec.$high === 0 && nsec.$low >= 1000000000))) {
			n = $div64(nsec, new $Int64(0, 1000000000), false);
			sec = (x$1 = n, new $Int64(sec.$high + x$1.$high, sec.$low + x$1.$low));
			nsec = (x$2 = $mul64(n, new $Int64(0, 1000000000)), new $Int64(nsec.$high - x$2.$high, nsec.$low - x$2.$low));
			if ((nsec.$high < 0 || (nsec.$high === 0 && nsec.$low < 0))) {
				nsec = (x$3 = new $Int64(0, 1000000000), new $Int64(nsec.$high + x$3.$high, nsec.$low + x$3.$low));
				sec = (x$4 = new $Int64(0, 1), new $Int64(sec.$high - x$4.$high, sec.$low - x$4.$low));
			}
		}
		return unixTime(sec, (((nsec.$low + ((nsec.$high >> 31) * 4294967296)) >> 0)));
	};
	$pkg.Unix = Unix;
	isLeap = function(year) {
		var _r, _r$1, _r$2, year;
		return ((_r = year % 4, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) === 0) && (!(((_r$1 = year % 100, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) === 0)) || ((_r$2 = year % 400, _r$2 === _r$2 ? _r$2 : $throwRuntimeError("integer divide by zero")) === 0));
	};
	norm = function(hi, lo, base) {
		var _q, _q$1, _tmp, _tmp$1, base, hi, lo, n, n$1, nhi, nlo;
		nhi = 0;
		nlo = 0;
		if (lo < 0) {
			n = (_q = ((-lo - 1 >> 0)) / base, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) + 1 >> 0;
			hi = hi - (n) >> 0;
			lo = lo + (($imul(n, base))) >> 0;
		}
		if (lo >= base) {
			n$1 = (_q$1 = lo / base, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero"));
			hi = hi + (n$1) >> 0;
			lo = lo - (($imul(n$1, base))) >> 0;
		}
		_tmp = hi;
		_tmp$1 = lo;
		nhi = _tmp;
		nlo = _tmp$1;
		return [nhi, nlo];
	};
	Date = function(year, month, day, hour, min, sec, nsec, loc) {
		var _r, _r$1, _r$2, _tuple, _tuple$1, _tuple$2, _tuple$3, _tuple$4, _tuple$5, _tuple$6, _tuple$7, abs, d, day, end, hour, loc, m, min, month, n, nsec, offset, sec, start, t, unix, utc, x$1, x$10, x$11, x$12, x$13, x$14, x$15, x$16, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, y, year, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _tuple = $f._tuple; _tuple$1 = $f._tuple$1; _tuple$2 = $f._tuple$2; _tuple$3 = $f._tuple$3; _tuple$4 = $f._tuple$4; _tuple$5 = $f._tuple$5; _tuple$6 = $f._tuple$6; _tuple$7 = $f._tuple$7; abs = $f.abs; d = $f.d; day = $f.day; end = $f.end; hour = $f.hour; loc = $f.loc; m = $f.m; min = $f.min; month = $f.month; n = $f.n; nsec = $f.nsec; offset = $f.offset; sec = $f.sec; start = $f.start; t = $f.t; unix = $f.unix; utc = $f.utc; x$1 = $f.x$1; x$10 = $f.x$10; x$11 = $f.x$11; x$12 = $f.x$12; x$13 = $f.x$13; x$14 = $f.x$14; x$15 = $f.x$15; x$16 = $f.x$16; x$2 = $f.x$2; x$3 = $f.x$3; x$4 = $f.x$4; x$5 = $f.x$5; x$6 = $f.x$6; x$7 = $f.x$7; x$8 = $f.x$8; x$9 = $f.x$9; y = $f.y; year = $f.year; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		if (loc === ptrType$2.nil) {
			$panic(new $String("time: missing Location in call to Date"));
		}
		m = ((month >> 0)) - 1 >> 0;
		_tuple = norm(year, m, 12);
		year = _tuple[0];
		m = _tuple[1];
		month = ((m >> 0)) + 1 >> 0;
		_tuple$1 = norm(sec, nsec, 1000000000);
		sec = _tuple$1[0];
		nsec = _tuple$1[1];
		_tuple$2 = norm(min, sec, 60);
		min = _tuple$2[0];
		sec = _tuple$2[1];
		_tuple$3 = norm(hour, min, 60);
		hour = _tuple$3[0];
		min = _tuple$3[1];
		_tuple$4 = norm(day, hour, 24);
		day = _tuple$4[0];
		hour = _tuple$4[1];
		y = ((x$1 = (x$2 = (new $Int64(0, year)), new $Int64(x$2.$high - -69, x$2.$low - 4075721025)), new $Uint64(x$1.$high, x$1.$low)));
		n = $div64(y, new $Uint64(0, 400), false);
		y = (x$3 = $mul64(new $Uint64(0, 400), n), new $Uint64(y.$high - x$3.$high, y.$low - x$3.$low));
		d = $mul64(new $Uint64(0, 146097), n);
		n = $div64(y, new $Uint64(0, 100), false);
		y = (x$4 = $mul64(new $Uint64(0, 100), n), new $Uint64(y.$high - x$4.$high, y.$low - x$4.$low));
		d = (x$5 = $mul64(new $Uint64(0, 36524), n), new $Uint64(d.$high + x$5.$high, d.$low + x$5.$low));
		n = $div64(y, new $Uint64(0, 4), false);
		y = (x$6 = $mul64(new $Uint64(0, 4), n), new $Uint64(y.$high - x$6.$high, y.$low - x$6.$low));
		d = (x$7 = $mul64(new $Uint64(0, 1461), n), new $Uint64(d.$high + x$7.$high, d.$low + x$7.$low));
		n = y;
		d = (x$8 = $mul64(new $Uint64(0, 365), n), new $Uint64(d.$high + x$8.$high, d.$low + x$8.$low));
		d = (x$9 = (new $Uint64(0, (x$10 = month - 1 >> 0, ((x$10 < 0 || x$10 >= daysBefore.length) ? ($throwRuntimeError("index out of range"), undefined) : daysBefore[x$10])))), new $Uint64(d.$high + x$9.$high, d.$low + x$9.$low));
		if (isLeap(year) && month >= 3) {
			d = (x$11 = new $Uint64(0, 1), new $Uint64(d.$high + x$11.$high, d.$low + x$11.$low));
		}
		d = (x$12 = (new $Uint64(0, (day - 1 >> 0))), new $Uint64(d.$high + x$12.$high, d.$low + x$12.$low));
		abs = $mul64(d, new $Uint64(0, 86400));
		abs = (x$13 = (new $Uint64(0, ((($imul(hour, 3600)) + ($imul(min, 60)) >> 0) + sec >> 0))), new $Uint64(abs.$high + x$13.$high, abs.$low + x$13.$low));
		unix = (x$14 = (new $Int64(abs.$high, abs.$low)), new $Int64(x$14.$high + -2147483647, x$14.$low + 3844486912));
		_r = loc.lookup(unix); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple$5 = _r;
		offset = _tuple$5[1];
		start = _tuple$5[2];
		end = _tuple$5[3];
		/* */ if (!((offset === 0))) { $s = 2; continue; }
		/* */ $s = 3; continue;
		/* if (!((offset === 0))) { */ case 2:
				utc = (x$15 = (new $Int64(0, offset)), new $Int64(unix.$high - x$15.$high, unix.$low - x$15.$low));
				/* */ if ((utc.$high < start.$high || (utc.$high === start.$high && utc.$low < start.$low))) { $s = 5; continue; }
				/* */ if ((utc.$high > end.$high || (utc.$high === end.$high && utc.$low >= end.$low))) { $s = 6; continue; }
				/* */ $s = 7; continue;
				/* if ((utc.$high < start.$high || (utc.$high === start.$high && utc.$low < start.$low))) { */ case 5:
					_r$1 = loc.lookup(new $Int64(start.$high - 0, start.$low - 1)); /* */ $s = 8; case 8: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
					_tuple$6 = _r$1;
					offset = _tuple$6[1];
					$s = 7; continue;
				/* } else if ((utc.$high > end.$high || (utc.$high === end.$high && utc.$low >= end.$low))) { */ case 6:
					_r$2 = loc.lookup(end); /* */ $s = 9; case 9: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
					_tuple$7 = _r$2;
					offset = _tuple$7[1];
				/* } */ case 7:
			case 4:
			unix = (x$16 = (new $Int64(0, offset)), new $Int64(unix.$high - x$16.$high, unix.$low - x$16.$low));
		/* } */ case 3:
		t = $clone(unixTime(unix, ((nsec >> 0))), Time);
		t.setLoc(loc);
		$s = -1; return t;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Date }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._tuple = _tuple; $f._tuple$1 = _tuple$1; $f._tuple$2 = _tuple$2; $f._tuple$3 = _tuple$3; $f._tuple$4 = _tuple$4; $f._tuple$5 = _tuple$5; $f._tuple$6 = _tuple$6; $f._tuple$7 = _tuple$7; $f.abs = abs; $f.d = d; $f.day = day; $f.end = end; $f.hour = hour; $f.loc = loc; $f.m = m; $f.min = min; $f.month = month; $f.n = n; $f.nsec = nsec; $f.offset = offset; $f.sec = sec; $f.start = start; $f.t = t; $f.unix = unix; $f.utc = utc; $f.x$1 = x$1; $f.x$10 = x$10; $f.x$11 = x$11; $f.x$12 = x$12; $f.x$13 = x$13; $f.x$14 = x$14; $f.x$15 = x$15; $f.x$16 = x$16; $f.x$2 = x$2; $f.x$3 = x$3; $f.x$4 = x$4; $f.x$5 = x$5; $f.x$6 = x$6; $f.x$7 = x$7; $f.x$8 = x$8; $f.x$9 = x$9; $f.y = y; $f.year = year; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.Date = Date;
	Time.ptr.prototype.Truncate = function(d) {
		var _tuple, d, r, t;
		t = this;
		t.stripMono();
		if ((d.$high < 0 || (d.$high === 0 && d.$low <= 0))) {
			return t;
		}
		_tuple = div($clone(t, Time), d);
		r = _tuple[1];
		return $clone(t, Time).Add(new Duration(-r.$high, -r.$low));
	};
	Time.prototype.Truncate = function(d) { return this.$val.Truncate(d); };
	Time.ptr.prototype.Round = function(d) {
		var _tuple, d, r, t;
		t = this;
		t.stripMono();
		if ((d.$high < 0 || (d.$high === 0 && d.$low <= 0))) {
			return t;
		}
		_tuple = div($clone(t, Time), d);
		r = _tuple[1];
		if (lessThanHalf(r, d)) {
			return $clone(t, Time).Add(new Duration(-r.$high, -r.$low));
		}
		return $clone(t, Time).Add(new Duration(d.$high - r.$high, d.$low - r.$low));
	};
	Time.prototype.Round = function(d) { return this.$val.Round(d); };
	div = function(t, d) {
		var _q, _r, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, d, d0, d1, d1$1, neg, nsec, qmod2, r, sec, sec$1, t, tmp, u0, u0x, u1, x$1, x$10, x$11, x$12, x$13, x$14, x$15, x$16, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		qmod2 = 0;
		r = new Duration(0, 0);
		neg = false;
		nsec = t.nsec();
		sec = t.sec();
		if ((sec.$high < 0 || (sec.$high === 0 && sec.$low < 0))) {
			neg = true;
			sec = new $Int64(-sec.$high, -sec.$low);
			nsec = -nsec;
			if (nsec < 0) {
				nsec = nsec + (1000000000) >> 0;
				sec = (x$1 = new $Int64(0, 1), new $Int64(sec.$high - x$1.$high, sec.$low - x$1.$low));
			}
		}
		if ((d.$high < 0 || (d.$high === 0 && d.$low < 1000000000)) && (x$2 = $div64(new Duration(0, 1000000000), (new Duration(d.$high + d.$high, d.$low + d.$low)), true), (x$2.$high === 0 && x$2.$low === 0))) {
			qmod2 = (((_q = nsec / (((d.$low + ((d.$high >> 31) * 4294967296)) >> 0)), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0)) & 1;
			r = (new Duration(0, (_r = nsec % (((d.$low + ((d.$high >> 31) * 4294967296)) >> 0)), _r === _r ? _r : $throwRuntimeError("integer divide by zero"))));
		} else if ((x$3 = $div64(d, new Duration(0, 1000000000), true), (x$3.$high === 0 && x$3.$low === 0))) {
			d1 = ((x$4 = $div64(d, new Duration(0, 1000000000), false), new $Int64(x$4.$high, x$4.$low)));
			qmod2 = (((x$5 = $div64(sec, d1, false), x$5.$low + ((x$5.$high >> 31) * 4294967296)) >> 0)) & 1;
			r = (x$6 = $mul64(((x$7 = $div64(sec, d1, true), new Duration(x$7.$high, x$7.$low))), new Duration(0, 1000000000)), x$8 = (new Duration(0, nsec)), new Duration(x$6.$high + x$8.$high, x$6.$low + x$8.$low));
		} else {
			sec$1 = (new $Uint64(sec.$high, sec.$low));
			tmp = $mul64(($shiftRightUint64(sec$1, 32)), new $Uint64(0, 1000000000));
			u1 = $shiftRightUint64(tmp, 32);
			u0 = $shiftLeft64(tmp, 32);
			tmp = $mul64((new $Uint64(sec$1.$high & 0, (sec$1.$low & 4294967295) >>> 0)), new $Uint64(0, 1000000000));
			_tmp = u0;
			_tmp$1 = new $Uint64(u0.$high + tmp.$high, u0.$low + tmp.$low);
			u0x = _tmp;
			u0 = _tmp$1;
			if ((u0.$high < u0x.$high || (u0.$high === u0x.$high && u0.$low < u0x.$low))) {
				u1 = (x$9 = new $Uint64(0, 1), new $Uint64(u1.$high + x$9.$high, u1.$low + x$9.$low));
			}
			_tmp$2 = u0;
			_tmp$3 = (x$10 = (new $Uint64(0, nsec)), new $Uint64(u0.$high + x$10.$high, u0.$low + x$10.$low));
			u0x = _tmp$2;
			u0 = _tmp$3;
			if ((u0.$high < u0x.$high || (u0.$high === u0x.$high && u0.$low < u0x.$low))) {
				u1 = (x$11 = new $Uint64(0, 1), new $Uint64(u1.$high + x$11.$high, u1.$low + x$11.$low));
			}
			d1$1 = (new $Uint64(d.$high, d.$low));
			while (true) {
				if (!(!((x$12 = $shiftRightUint64(d1$1, 63), (x$12.$high === 0 && x$12.$low === 1))))) { break; }
				d1$1 = $shiftLeft64(d1$1, (1));
			}
			d0 = new $Uint64(0, 0);
			while (true) {
				qmod2 = 0;
				if ((u1.$high > d1$1.$high || (u1.$high === d1$1.$high && u1.$low > d1$1.$low)) || (u1.$high === d1$1.$high && u1.$low === d1$1.$low) && (u0.$high > d0.$high || (u0.$high === d0.$high && u0.$low >= d0.$low))) {
					qmod2 = 1;
					_tmp$4 = u0;
					_tmp$5 = new $Uint64(u0.$high - d0.$high, u0.$low - d0.$low);
					u0x = _tmp$4;
					u0 = _tmp$5;
					if ((u0.$high > u0x.$high || (u0.$high === u0x.$high && u0.$low > u0x.$low))) {
						u1 = (x$13 = new $Uint64(0, 1), new $Uint64(u1.$high - x$13.$high, u1.$low - x$13.$low));
					}
					u1 = (x$14 = d1$1, new $Uint64(u1.$high - x$14.$high, u1.$low - x$14.$low));
				}
				if ((d1$1.$high === 0 && d1$1.$low === 0) && (x$15 = (new $Uint64(d.$high, d.$low)), (d0.$high === x$15.$high && d0.$low === x$15.$low))) {
					break;
				}
				d0 = $shiftRightUint64(d0, (1));
				d0 = (x$16 = $shiftLeft64((new $Uint64(d1$1.$high & 0, (d1$1.$low & 1) >>> 0)), 63), new $Uint64(d0.$high | x$16.$high, (d0.$low | x$16.$low) >>> 0));
				d1$1 = $shiftRightUint64(d1$1, (1));
			}
			r = (new Duration(u0.$high, u0.$low));
		}
		if (neg && !((r.$high === 0 && r.$low === 0))) {
			qmod2 = (qmod2 ^ (1)) >> 0;
			r = new Duration(d.$high - r.$high, d.$low - r.$low);
		}
		return [qmod2, r];
	};
	Location.ptr.prototype.get = function() {
		var l, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; l = $f.l; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		l = this;
		if (l === ptrType$2.nil) {
			$s = -1; return utcLoc;
		}
		/* */ if (l === localLoc) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (l === localLoc) { */ case 1:
			$r = localOnce.Do(initLocal); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 2:
		$s = -1; return l;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Location.ptr.prototype.get }; } $f.l = l; $f.$s = $s; $f.$r = $r; return $f;
	};
	Location.prototype.get = function() { return this.$val.get(); };
	Location.ptr.prototype.String = function() {
		var _r, l, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; l = $f.l; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		l = this;
		_r = l.get(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r.name;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Location.ptr.prototype.String }; } $f._r = _r; $f.l = l; $f.$s = $s; $f.$r = $r; return $f;
	};
	Location.prototype.String = function() { return this.$val.String(); };
	FixedZone = function(name, offset) {
		var l, name, offset, x$1;
		l = new Location.ptr(name, new sliceType([new zone.ptr(name, offset, false)]), new sliceType$1([new zoneTrans.ptr(new $Int64(-2147483648, 0), 0, false, false)]), new $Int64(-2147483648, 0), new $Int64(2147483647, 4294967295), ptrType.nil);
		l.cacheZone = (x$1 = l.zone, (0 >= x$1.$length ? ($throwRuntimeError("index out of range"), undefined) : x$1.$array[x$1.$offset + 0]));
		return l;
	};
	$pkg.FixedZone = FixedZone;
	Location.ptr.prototype.lookup = function(sec) {
		var _q, _r, end, hi, l, lim, lo, m, name, offset, sec, start, tx, x$1, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, zone$1, zone$2, zone$3, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _q = $f._q; _r = $f._r; end = $f.end; hi = $f.hi; l = $f.l; lim = $f.lim; lo = $f.lo; m = $f.m; name = $f.name; offset = $f.offset; sec = $f.sec; start = $f.start; tx = $f.tx; x$1 = $f.x$1; x$2 = $f.x$2; x$3 = $f.x$3; x$4 = $f.x$4; x$5 = $f.x$5; x$6 = $f.x$6; x$7 = $f.x$7; x$8 = $f.x$8; x$9 = $f.x$9; zone$1 = $f.zone$1; zone$2 = $f.zone$2; zone$3 = $f.zone$3; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		name = "";
		offset = 0;
		start = new $Int64(0, 0);
		end = new $Int64(0, 0);
		l = this;
		_r = l.get(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		l = _r;
		if (l.zone.$length === 0) {
			name = "UTC";
			offset = 0;
			start = new $Int64(-2147483648, 0);
			end = new $Int64(2147483647, 4294967295);
			$s = -1; return [name, offset, start, end];
		}
		zone$1 = l.cacheZone;
		if (!(zone$1 === ptrType.nil) && (x$1 = l.cacheStart, (x$1.$high < sec.$high || (x$1.$high === sec.$high && x$1.$low <= sec.$low))) && (x$2 = l.cacheEnd, (sec.$high < x$2.$high || (sec.$high === x$2.$high && sec.$low < x$2.$low)))) {
			name = zone$1.name;
			offset = zone$1.offset;
			start = l.cacheStart;
			end = l.cacheEnd;
			$s = -1; return [name, offset, start, end];
		}
		if ((l.tx.$length === 0) || (x$3 = (x$4 = l.tx, (0 >= x$4.$length ? ($throwRuntimeError("index out of range"), undefined) : x$4.$array[x$4.$offset + 0])).when, (sec.$high < x$3.$high || (sec.$high === x$3.$high && sec.$low < x$3.$low)))) {
			zone$2 = (x$5 = l.zone, x$6 = l.lookupFirstZone(), ((x$6 < 0 || x$6 >= x$5.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$5.$array[x$5.$offset + x$6]));
			name = zone$2.name;
			offset = zone$2.offset;
			start = new $Int64(-2147483648, 0);
			if (l.tx.$length > 0) {
				end = (x$7 = l.tx, (0 >= x$7.$length ? ($throwRuntimeError("index out of range"), undefined) : x$7.$array[x$7.$offset + 0])).when;
			} else {
				end = new $Int64(2147483647, 4294967295);
			}
			$s = -1; return [name, offset, start, end];
		}
		tx = l.tx;
		end = new $Int64(2147483647, 4294967295);
		lo = 0;
		hi = tx.$length;
		while (true) {
			if (!((hi - lo >> 0) > 1)) { break; }
			m = lo + (_q = ((hi - lo >> 0)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0;
			lim = ((m < 0 || m >= tx.$length) ? ($throwRuntimeError("index out of range"), undefined) : tx.$array[tx.$offset + m]).when;
			if ((sec.$high < lim.$high || (sec.$high === lim.$high && sec.$low < lim.$low))) {
				end = lim;
				hi = m;
			} else {
				lo = m;
			}
		}
		zone$3 = (x$8 = l.zone, x$9 = ((lo < 0 || lo >= tx.$length) ? ($throwRuntimeError("index out of range"), undefined) : tx.$array[tx.$offset + lo]).index, ((x$9 < 0 || x$9 >= x$8.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$8.$array[x$8.$offset + x$9]));
		name = zone$3.name;
		offset = zone$3.offset;
		start = ((lo < 0 || lo >= tx.$length) ? ($throwRuntimeError("index out of range"), undefined) : tx.$array[tx.$offset + lo]).when;
		$s = -1; return [name, offset, start, end];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Location.ptr.prototype.lookup }; } $f._q = _q; $f._r = _r; $f.end = end; $f.hi = hi; $f.l = l; $f.lim = lim; $f.lo = lo; $f.m = m; $f.name = name; $f.offset = offset; $f.sec = sec; $f.start = start; $f.tx = tx; $f.x$1 = x$1; $f.x$2 = x$2; $f.x$3 = x$3; $f.x$4 = x$4; $f.x$5 = x$5; $f.x$6 = x$6; $f.x$7 = x$7; $f.x$8 = x$8; $f.x$9 = x$9; $f.zone$1 = zone$1; $f.zone$2 = zone$2; $f.zone$3 = zone$3; $f.$s = $s; $f.$r = $r; return $f;
	};
	Location.prototype.lookup = function(sec) { return this.$val.lookup(sec); };
	Location.ptr.prototype.lookupFirstZone = function() {
		var _i, _ref, l, x$1, x$2, x$3, x$4, x$5, x$6, zi, zi$1;
		l = this;
		if (!l.firstZoneUsed()) {
			return 0;
		}
		if (l.tx.$length > 0 && (x$1 = l.zone, x$2 = (x$3 = l.tx, (0 >= x$3.$length ? ($throwRuntimeError("index out of range"), undefined) : x$3.$array[x$3.$offset + 0])).index, ((x$2 < 0 || x$2 >= x$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$1.$array[x$1.$offset + x$2])).isDST) {
			zi = (((x$4 = l.tx, (0 >= x$4.$length ? ($throwRuntimeError("index out of range"), undefined) : x$4.$array[x$4.$offset + 0])).index >> 0)) - 1 >> 0;
			while (true) {
				if (!(zi >= 0)) { break; }
				if (!(x$5 = l.zone, ((zi < 0 || zi >= x$5.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$5.$array[x$5.$offset + zi])).isDST) {
					return zi;
				}
				zi = zi - (1) >> 0;
			}
		}
		_ref = l.zone;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			zi$1 = _i;
			if (!(x$6 = l.zone, ((zi$1 < 0 || zi$1 >= x$6.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$6.$array[x$6.$offset + zi$1])).isDST) {
				return zi$1;
			}
			_i++;
		}
		return 0;
	};
	Location.prototype.lookupFirstZone = function() { return this.$val.lookupFirstZone(); };
	Location.ptr.prototype.firstZoneUsed = function() {
		var _i, _ref, l, tx;
		l = this;
		_ref = l.tx;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			tx = $clone(((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]), zoneTrans);
			if (tx.index === 0) {
				return true;
			}
			_i++;
		}
		return false;
	};
	Location.prototype.firstZoneUsed = function() { return this.$val.firstZoneUsed(); };
	Location.ptr.prototype.lookupName = function(name, unix) {
		var _i, _i$1, _r, _r$1, _ref, _ref$1, _tmp, _tmp$1, _tmp$2, _tmp$3, _tuple, i, i$1, l, nam, name, offset, offset$1, ok, unix, x$1, x$2, x$3, zone$1, zone$2, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _i = $f._i; _i$1 = $f._i$1; _r = $f._r; _r$1 = $f._r$1; _ref = $f._ref; _ref$1 = $f._ref$1; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; _tuple = $f._tuple; i = $f.i; i$1 = $f.i$1; l = $f.l; nam = $f.nam; name = $f.name; offset = $f.offset; offset$1 = $f.offset$1; ok = $f.ok; unix = $f.unix; x$1 = $f.x$1; x$2 = $f.x$2; x$3 = $f.x$3; zone$1 = $f.zone$1; zone$2 = $f.zone$2; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		offset = 0;
		ok = false;
		l = this;
		_r = l.get(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		l = _r;
		_ref = l.zone;
		_i = 0;
		/* while (true) { */ case 2:
			/* if (!(_i < _ref.$length)) { break; } */ if(!(_i < _ref.$length)) { $s = 3; continue; }
			i = _i;
			zone$1 = (x$1 = l.zone, ((i < 0 || i >= x$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$1.$array[x$1.$offset + i]));
			/* */ if (zone$1.name === name) { $s = 4; continue; }
			/* */ $s = 5; continue;
			/* if (zone$1.name === name) { */ case 4:
				_r$1 = l.lookup((x$2 = (new $Int64(0, zone$1.offset)), new $Int64(unix.$high - x$2.$high, unix.$low - x$2.$low))); /* */ $s = 6; case 6: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				_tuple = _r$1;
				nam = _tuple[0];
				offset$1 = _tuple[1];
				if (nam === zone$1.name) {
					_tmp = offset$1;
					_tmp$1 = true;
					offset = _tmp;
					ok = _tmp$1;
					$s = -1; return [offset, ok];
				}
			/* } */ case 5:
			_i++;
		/* } */ $s = 2; continue; case 3:
		_ref$1 = l.zone;
		_i$1 = 0;
		while (true) {
			if (!(_i$1 < _ref$1.$length)) { break; }
			i$1 = _i$1;
			zone$2 = (x$3 = l.zone, ((i$1 < 0 || i$1 >= x$3.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$3.$array[x$3.$offset + i$1]));
			if (zone$2.name === name) {
				_tmp$2 = zone$2.offset;
				_tmp$3 = true;
				offset = _tmp$2;
				ok = _tmp$3;
				$s = -1; return [offset, ok];
			}
			_i$1++;
		}
		$s = -1; return [offset, ok];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Location.ptr.prototype.lookupName }; } $f._i = _i; $f._i$1 = _i$1; $f._r = _r; $f._r$1 = _r$1; $f._ref = _ref; $f._ref$1 = _ref$1; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f._tuple = _tuple; $f.i = i; $f.i$1 = i$1; $f.l = l; $f.nam = nam; $f.name = name; $f.offset = offset; $f.offset$1 = offset$1; $f.ok = ok; $f.unix = unix; $f.x$1 = x$1; $f.x$2 = x$2; $f.x$3 = x$3; $f.zone$1 = zone$1; $f.zone$2 = zone$2; $f.$s = $s; $f.$r = $r; return $f;
	};
	Location.prototype.lookupName = function(name, unix) { return this.$val.lookupName(name, unix); };
	ptrType$4.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	Time.methods = [{prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Format", name: "Format", pkg: "", typ: $funcType([$String], [$String], false)}, {prop: "AppendFormat", name: "AppendFormat", pkg: "", typ: $funcType([sliceType$3, $String], [sliceType$3], false)}, {prop: "After", name: "After", pkg: "", typ: $funcType([Time], [$Bool], false)}, {prop: "Before", name: "Before", pkg: "", typ: $funcType([Time], [$Bool], false)}, {prop: "Equal", name: "Equal", pkg: "", typ: $funcType([Time], [$Bool], false)}, {prop: "IsZero", name: "IsZero", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "abs", name: "abs", pkg: "time", typ: $funcType([], [$Uint64], false)}, {prop: "locabs", name: "locabs", pkg: "time", typ: $funcType([], [$String, $Int, $Uint64], false)}, {prop: "Date", name: "Date", pkg: "", typ: $funcType([], [$Int, Month, $Int], false)}, {prop: "Year", name: "Year", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Month", name: "Month", pkg: "", typ: $funcType([], [Month], false)}, {prop: "Day", name: "Day", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Weekday", name: "Weekday", pkg: "", typ: $funcType([], [Weekday], false)}, {prop: "ISOWeek", name: "ISOWeek", pkg: "", typ: $funcType([], [$Int, $Int], false)}, {prop: "Clock", name: "Clock", pkg: "", typ: $funcType([], [$Int, $Int, $Int], false)}, {prop: "Hour", name: "Hour", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Minute", name: "Minute", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Second", name: "Second", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Nanosecond", name: "Nanosecond", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "YearDay", name: "YearDay", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Add", name: "Add", pkg: "", typ: $funcType([Duration], [Time], false)}, {prop: "Sub", name: "Sub", pkg: "", typ: $funcType([Time], [Duration], false)}, {prop: "AddDate", name: "AddDate", pkg: "", typ: $funcType([$Int, $Int, $Int], [Time], false)}, {prop: "date", name: "date", pkg: "time", typ: $funcType([$Bool], [$Int, Month, $Int, $Int], false)}, {prop: "UTC", name: "UTC", pkg: "", typ: $funcType([], [Time], false)}, {prop: "Local", name: "Local", pkg: "", typ: $funcType([], [Time], false)}, {prop: "In", name: "In", pkg: "", typ: $funcType([ptrType$2], [Time], false)}, {prop: "Location", name: "Location", pkg: "", typ: $funcType([], [ptrType$2], false)}, {prop: "Zone", name: "Zone", pkg: "", typ: $funcType([], [$String, $Int], false)}, {prop: "Unix", name: "Unix", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "UnixNano", name: "UnixNano", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "MarshalBinary", name: "MarshalBinary", pkg: "", typ: $funcType([], [sliceType$3, $error], false)}, {prop: "GobEncode", name: "GobEncode", pkg: "", typ: $funcType([], [sliceType$3, $error], false)}, {prop: "MarshalJSON", name: "MarshalJSON", pkg: "", typ: $funcType([], [sliceType$3, $error], false)}, {prop: "MarshalText", name: "MarshalText", pkg: "", typ: $funcType([], [sliceType$3, $error], false)}, {prop: "Truncate", name: "Truncate", pkg: "", typ: $funcType([Duration], [Time], false)}, {prop: "Round", name: "Round", pkg: "", typ: $funcType([Duration], [Time], false)}];
	ptrType$7.methods = [{prop: "nsec", name: "nsec", pkg: "time", typ: $funcType([], [$Int32], false)}, {prop: "sec", name: "sec", pkg: "time", typ: $funcType([], [$Int64], false)}, {prop: "unixSec", name: "unixSec", pkg: "time", typ: $funcType([], [$Int64], false)}, {prop: "addSec", name: "addSec", pkg: "time", typ: $funcType([$Int64], [], false)}, {prop: "setLoc", name: "setLoc", pkg: "time", typ: $funcType([ptrType$2], [], false)}, {prop: "stripMono", name: "stripMono", pkg: "time", typ: $funcType([], [], false)}, {prop: "setMono", name: "setMono", pkg: "time", typ: $funcType([$Int64], [], false)}, {prop: "mono", name: "mono", pkg: "time", typ: $funcType([], [$Int64], false)}, {prop: "UnmarshalBinary", name: "UnmarshalBinary", pkg: "", typ: $funcType([sliceType$3], [$error], false)}, {prop: "GobDecode", name: "GobDecode", pkg: "", typ: $funcType([sliceType$3], [$error], false)}, {prop: "UnmarshalJSON", name: "UnmarshalJSON", pkg: "", typ: $funcType([sliceType$3], [$error], false)}, {prop: "UnmarshalText", name: "UnmarshalText", pkg: "", typ: $funcType([sliceType$3], [$error], false)}];
	Month.methods = [{prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}];
	Weekday.methods = [{prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}];
	Duration.methods = [{prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Nanoseconds", name: "Nanoseconds", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "Seconds", name: "Seconds", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Minutes", name: "Minutes", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Hours", name: "Hours", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Truncate", name: "Truncate", pkg: "", typ: $funcType([Duration], [Duration], false)}, {prop: "Round", name: "Round", pkg: "", typ: $funcType([Duration], [Duration], false)}];
	ptrType$2.methods = [{prop: "get", name: "get", pkg: "time", typ: $funcType([], [ptrType$2], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "lookup", name: "lookup", pkg: "time", typ: $funcType([$Int64], [$String, $Int, $Int64, $Int64], false)}, {prop: "lookupFirstZone", name: "lookupFirstZone", pkg: "time", typ: $funcType([], [$Int], false)}, {prop: "firstZoneUsed", name: "firstZoneUsed", pkg: "time", typ: $funcType([], [$Bool], false)}, {prop: "lookupName", name: "lookupName", pkg: "time", typ: $funcType([$String, $Int64], [$Int, $Bool], false)}];
	ParseError.init("", [{prop: "Layout", name: "Layout", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "Value", name: "Value", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "LayoutElem", name: "LayoutElem", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "ValueElem", name: "ValueElem", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "Message", name: "Message", embedded: false, exported: true, typ: $String, tag: ""}]);
	Time.init("time", [{prop: "wall", name: "wall", embedded: false, exported: false, typ: $Uint64, tag: ""}, {prop: "ext", name: "ext", embedded: false, exported: false, typ: $Int64, tag: ""}, {prop: "loc", name: "loc", embedded: false, exported: false, typ: ptrType$2, tag: ""}]);
	Location.init("time", [{prop: "name", name: "name", embedded: false, exported: false, typ: $String, tag: ""}, {prop: "zone", name: "zone", embedded: false, exported: false, typ: sliceType, tag: ""}, {prop: "tx", name: "tx", embedded: false, exported: false, typ: sliceType$1, tag: ""}, {prop: "cacheStart", name: "cacheStart", embedded: false, exported: false, typ: $Int64, tag: ""}, {prop: "cacheEnd", name: "cacheEnd", embedded: false, exported: false, typ: $Int64, tag: ""}, {prop: "cacheZone", name: "cacheZone", embedded: false, exported: false, typ: ptrType, tag: ""}]);
	zone.init("time", [{prop: "name", name: "name", embedded: false, exported: false, typ: $String, tag: ""}, {prop: "offset", name: "offset", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "isDST", name: "isDST", embedded: false, exported: false, typ: $Bool, tag: ""}]);
	zoneTrans.init("time", [{prop: "when", name: "when", embedded: false, exported: false, typ: $Int64, tag: ""}, {prop: "index", name: "index", embedded: false, exported: false, typ: $Uint8, tag: ""}, {prop: "isstd", name: "isstd", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "isutc", name: "isutc", embedded: false, exported: false, typ: $Bool, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = errors.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = js.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = nosync.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = runtime.$init(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = syscall.$init(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		localLoc = new Location.ptr("", sliceType.nil, sliceType$1.nil, new $Int64(0, 0), new $Int64(0, 0), ptrType.nil);
		localOnce = new nosync.Once.ptr(false, false);
		zoneSources = new sliceType$2([runtime.GOROOT() + "/lib/time/zoneinfo.zip"]);
		std0x = $toNativeArray($kindInt, [260, 265, 524, 526, 528, 274]);
		longDayNames = new sliceType$2(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
		shortDayNames = new sliceType$2(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
		shortMonthNames = new sliceType$2(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
		longMonthNames = new sliceType$2(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]);
		atoiError = errors.New("time: invalid number");
		errBad = errors.New("bad value for field");
		errLeadingInt = errors.New("time: bad [0-9]*");
		months = $toNativeArray($kindString, ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]);
		days = $toNativeArray($kindString, ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
		daysBefore = $toNativeArray($kindInt32, [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365]);
		startNano = (x = runtimeNano(), new $Int64(x.$high - 0, x.$low - 1));
		utcLoc = new Location.ptr("UTC", sliceType.nil, sliceType$1.nil, new $Int64(0, 0), new $Int64(0, 0), ptrType.nil);
		$pkg.UTC = utcLoc;
		$pkg.Local = localLoc;
		errLocation = errors.New("time: invalid location name");
		badData = errors.New("malformed time zone information");
		$unused(new sliceType$2(["/usr/share/zoneinfo/", "/usr/share/lib/zoneinfo/", "/usr/lib/locale/TZ/", runtime.GOROOT() + "/lib/time/zoneinfo.zip"]));
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["main"] = (function() {
	var $pkg = {}, $init, suggest, rand, time, sliceType$1, TestString, main;
	suggest = $packages["github.com/siongui/gopherjs-input-suggest"];
	rand = $packages["math/rand"];
	time = $packages["time"];
	sliceType$1 = $sliceType($String);
	TestString = function(w, count) {
		var count, i, w;
		i = 0;
		while (true) {
			if (!(i < count)) { break; }
			w = w + (($encodeRune("ABCDEFGHIJKLMNO".charCodeAt(i))));
			i = i + (1) >> 0;
		}
		return w;
	};
	$pkg.TestString = TestString;
	main = function() {
		suggest.BindSuggest("word", (function(w) {
			var i, result, w;
			result = sliceType$1.nil;
			i = 0;
			while (true) {
				if (!(i < 10)) { break; }
				result = $append(result, TestString(w, i));
				i = i + (1) >> 0;
			}
			return result;
		}));
	};
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = suggest.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = rand.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = time.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		if ($pkg === $mainPkg) {
			main();
			$mainFinished = true;
		}
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$synthesizeMethods();
var $mainPkg = $packages["main"];
$packages["runtime"].$init();
$go($mainPkg.$init, []);
$flushConsole();

}).call(this);
//# sourceMappingURL=suggest.js.map
