"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const yaml_1 = __importDefault(require("yaml"));
const fs_1 = __importDefault(require("fs"));
const deep_diff_1 = require("deep-diff");
function reorderKeys(obj, keyOrder) {
    const propNames = Object.getOwnPropertyNames(obj);
    const objSave = Object.assign({}, obj);
    if (propNames.length != keyOrder.length) {
        throw new TypeError(`keyOrder.length ${keyOrder.length} != ownProperties.length ${propNames.length}, not reordering`);
    }
    for (const prop of keyOrder) {
        if (!propNames.includes(prop)) {
            throw new TypeError(`keyOrder property ${prop} not in ownProperties`);
        }
        delete obj[prop];
        obj[prop] = objSave[prop];
    }
    return obj;
}
exports.reorderKeys = reorderKeys;
function copyReorderKeys(obj, keyOrder) {
    const copy = Object.assign({}, obj);
    return reorderKeys(copy, keyOrder);
}
exports.copyReorderKeys = copyReorderKeys;
function sortKeys(obj) {
    const keyOrder = Object.getOwnPropertyNames(obj).sort();
    return reorderKeys(obj, keyOrder);
}
exports.sortKeys = sortKeys;
const copyPatchType = Symbol('copyPatchType');
function makePatchSpec(type, arg) {
    return {
        [copyPatchType]: type,
        [type]: arg,
    };
}
function isPatchSpec(spec, type) {
    if (!spec)
        return false;
    return spec[copyPatchType] === type;
}
deepCopy.descriptor = (d) => makePatchSpec('descriptor', d);
deepCopy.value = (v) => makePatchSpec('value', v);
deepCopy.object = (o) => makePatchSpec('object', o);
deepCopy.array = (a) => makePatchSpec('array', a);
function inferPatchSpec(p) {
    if (typeof p === 'undefined') {
        return undefined;
    }
    else if (!p) {
        return deepCopy.value(p);
    }
    else if (typeof p === 'object' && copyPatchType in p) {
        return p;
    }
    else if (Array.isArray(p)) {
        return deepCopy.array(p);
    }
    else if (typeof p === 'object') {
        return deepCopy.object(p);
    }
    else {
        return deepCopy.value(p);
    }
}
function _deepCopy(circReg, obj, patches) {
    const patchSpec = inferPatchSpec(patches);
    if (isPatchSpec(patchSpec, 'value')) {
        return patchSpec.value;
    }
    if (isPatchSpec(patchSpec, 'descriptor')) {
        throw new TypeError("Not expecting a descriptor spec here");
    }
    if (!obj && isPatchSpec(patchSpec, 'array')) {
        obj = [];
        Object.setPrototypeOf(obj, Object.getPrototypeOf(patchSpec.array));
    }
    else if (!obj && isPatchSpec(patchSpec, 'object')) {
        obj = {};
        Object.setPrototypeOf(obj, Object.getPrototypeOf(patchSpec.object));
    }
    if (!obj || typeof obj !== 'object') {
        return obj;
    }
    if (circReg.has(obj)) {
        return circReg.get(obj);
    }
    const descriptors = Object.getOwnPropertyDescriptors(obj);
    if (isPatchSpec(patchSpec, 'array') && !Array.isArray(obj)) {
        throw new TypeError("Patch spec array received for object");
    }
    const recurse = {};
    if (patchSpec) {
        const subSpecs = isPatchSpec(patchSpec, 'array') ? patchSpec.array : patchSpec.object;
        for (const prop of Object.getOwnPropertyNames(subSpecs).concat(Object.getOwnPropertySymbols(subSpecs))) {
            const subSpec = inferPatchSpec(subSpecs[prop]);
            if (isPatchSpec(patchSpec, 'array') && prop === 'length')
                continue; // don't patch length unless specifically requested
            if (!subSpec)
                continue;
            if (isPatchSpec(subSpec, 'value')) {
                descriptors[prop] = Object.assign(Object.assign({}, (descriptors[prop] || {
                    enumerable: true,
                    configurable: true,
                    writable: true,
                })), { value: subSpec.value });
            }
            else if (isPatchSpec(subSpec, 'descriptor')) {
                descriptors[prop] = Object.assign(Object.assign({}, descriptors[prop]), subSpec.descriptor);
            }
            else {
                recurse[prop] = subSpec;
                if (!(prop in descriptors)) {
                    descriptors[prop] = {
                        enumerable: true,
                        configurable: true,
                        writable: true,
                        value: null,
                    };
                }
            }
        }
    }
    const newObj = Array.isArray(obj) ? [] : {};
    circReg.set(obj, newObj);
    for (const prop of Object.getOwnPropertyNames(descriptors).concat(Object.getOwnPropertySymbols(descriptors))) {
        const descriptor = descriptors[prop];
        if (Array.isArray(obj) && prop === 'length') {
            // Normally we do nothing at all with an array's length, UNLESS it was specifically mentioned. And even then, we just set the length.
            if (isPatchSpec(patchSpec, 'object') && 'length' in patchSpec.object) {
                // this has already been parsed by the above, so:
                newObj.length = descriptor.value;
            }
        }
        if ('value' in descriptor) {
            descriptor.value = _deepCopy(circReg, descriptor.value, recurse[prop]);
        }
        Object.defineProperty(newObj, prop, descriptor);
    }
    if (Object.getPrototypeOf(obj) !== Object.getPrototypeOf(newObj)) {
        Object.setPrototypeOf(newObj, Object.getPrototypeOf(obj));
    }
    return newObj;
}
function deepCopy(obj, patches) { return _deepCopy(new Map(), obj, patches); }
exports.deepCopy = deepCopy;
exports.orderSymbol = Symbol("keyOrder");
function recordKeyOrder(obj, recursive = false, key = false, descriptor) {
    const orderKey = typeof key === 'boolean' ? exports.orderSymbol : key;
    const descriptorOpts = Object.assign({ writable: true, enumerable: !!key, configurable: true }, (descriptor || {}));
    if (typeof obj == 'object' && obj && !Array.isArray(obj)) {
        Object.defineProperty(obj, orderKey, Object.assign(Object.assign({}, descriptorOpts), { value: Object.getOwnPropertyNames(obj).filter(p => p !== orderKey) }));
    }
    if (recursive && obj && typeof obj === 'object') {
        for (const prop in obj) {
            recordKeyOrder(obj[prop], recursive, key, descriptor);
        }
    }
    return obj;
}
exports.recordKeyOrder = recordKeyOrder;
function restoreKeyOrder(obj, recursive = false, key = false) {
    const orderKey = key || exports.orderSymbol;
    if (typeof obj === 'object' && obj && orderKey in obj) {
        const order = obj[orderKey];
        delete obj[orderKey];
        reorderKeys(obj, order);
    }
    if (recursive && obj && typeof obj == 'object') {
        for (const prop in obj) {
            restoreKeyOrder(obj[prop], recursive, key);
        }
    }
    return obj;
}
exports.restoreKeyOrder = restoreKeyOrder;
function loadAndParse(path, parser, inhibitErrors = false) {
    try {
        const data = fs_1.default.readFileSync(path, { encoding: "utf8" });
        return parser(data);
    }
    catch (e) {
        if (inhibitErrors) {
            return null;
        }
        throw e;
    }
}
exports.loadAndParse = loadAndParse;
function patchObject(jsonContents, packageDiff) {
    if (!packageDiff) {
        return jsonContents;
    }
    for (let diffEntry of packageDiff) {
        deep_diff_1.applyChange(jsonContents, null, diffEntry);
    }
    return jsonContents;
}
exports.patchObject = patchObject;
function astNodeIs(value, ...list) {
    if (!value) {
        return false;
    }
    return list.includes(value.type);
}
function getMapEntries(map) {
    return map.items.map((p) => {
        if (p.type === 'PAIR') {
            if (typeof p.key === 'string') {
                return [p.key, p];
            }
            else if (astNodeIs(p.key, 'PLAIN', 'QUOTE_DOUBLE', 'QUOTE_SINGLE') && (typeof p.key.value === "string" || typeof p.key.value === "number")) {
                return [p.key.value.toString(), p];
            }
        }
        throw new TypeError(`Cannot handle map pair ${p}`);
    });
}
function getMapOrder(map) {
    return getMapEntries(map).map(([key, _]) => key);
}
function setMapOrder(map, mapOrder) {
    const mapItems = {};
    for (const [key, value] of getMapEntries(map)) {
        mapItems[key] = value;
    }
    map.items = mapOrder.map(key => mapItems[key]);
}
function patchYamlDocument(yamlDoc, packageDiff, orderKey) {
    if (!packageDiff) {
        return yamlDoc;
    }
    if (orderKey === true) {
        orderKey = exports.orderSymbol;
    }
    const reorders = {};
    for (const diffEntry of packageDiff) {
        if (orderKey && diffEntry.path && diffEntry.path.includes(orderKey)) {
            const itemPath = diffEntry.path.slice(0, diffEntry.path.indexOf(orderKey));
            const subPath = diffEntry.path.slice(diffEntry.path.indexOf(orderKey) + 1);
            const pathJson = JSON.stringify(itemPath);
            if (!(pathJson in reorders)) {
                const map = yamlDoc.getIn(itemPath);
                if (!astNodeIs(map, 'FLOW_MAP', 'MAP')) {
                    throw new Error(`Got an order entry in something not a Map: ${diffEntry.path}`);
                }
                reorders[pathJson] = getMapOrder(map);
            }
            const newDiff = deepCopy(diffEntry, { path: deepCopy.value(subPath.length == 0 ? undefined : subPath) });
            deep_diff_1.applyChange(reorders[pathJson], null, newDiff);
            continue;
        }
        const editPath = (diffEntry.path || []).concat(diffEntry.kind == 'A' ? diffEntry.index : []);
        const editItem = (diffEntry.kind == 'A') ? diffEntry.item : diffEntry;
        if (editItem.kind == 'E' || editItem.kind == 'N') {
            const origNode = yamlDoc.getIn(editPath, true);
            const newNode = typeof editItem.rhs == 'undefined' ? undefined : yaml_1.default.createNode(editItem.rhs);
            if (origNode && newNode) {
                newNode.comment = origNode.comment;
                newNode.commentBefore = origNode.commentBefore;
            }
            yamlDoc.setIn(editPath, newNode);
        }
        else if (editItem.kind == 'D') {
            yamlDoc.deleteIn(editPath);
        }
    }
    for (const [pathJson, mapOrder] of Object.entries(reorders)) {
        const path = JSON.parse(pathJson);
        const map = yamlDoc.getIn(path);
        if (!astNodeIs(map, 'FLOW_MAP', 'MAP')) {
            throw new Error(`Unexpected non-map found in path ${pathJson}`);
        }
        setMapOrder(map, mapOrder);
    }
    return yamlDoc;
}
exports.patchYamlDocument = patchYamlDocument;
