/**
 * Force HS256 on every jsonwebtoken sign/verify in this process.
 */
function patchJwt(jwtLib) {
    if (!jwtLib || jwtLib.__tcHs256Patched) return jwtLib;
    const origVerify = jwtLib.verify.bind(jwtLib);
    const origSign = jwtLib.sign.bind(jwtLib);

    jwtLib.verify = function verifyHs256(token, secretOrKey, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        const opts = Object.assign({}, options && typeof options === 'object' ? options : {});
        if (!opts.algorithms) opts.algorithms = ['HS256'];
        if (callback) return origVerify(token, secretOrKey, opts, callback);
        return origVerify(token, secretOrKey, opts);
    };

    jwtLib.sign = function signHs256(payload, secretOrKey, options, callback) {
        const opts = Object.assign({}, options && typeof options === 'object' ? options : {});
        if (!opts.algorithm) opts.algorithm = 'HS256';
        if (callback) return origSign(payload, secretOrKey, opts, callback);
        return origSign(payload, secretOrKey, opts);
    };

    jwtLib.__tcHs256Patched = true;
    return jwtLib;
}

module.exports = { patchJwt };
