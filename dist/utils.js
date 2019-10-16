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
function patchYamlDocument(yamlDoc, packageDiff) {
    for (const diffEntry of packageDiff) {
        const editPath = (diffEntry.path || []).concat(diffEntry.kind == 'A' ? diffEntry.index : []);
        const editItem = (diffEntry.kind == 'A') ? diffEntry.item : diffEntry;
        if (editItem.kind == 'E' || editItem.kind == 'N') {
            yamlDoc.setIn(editPath, typeof editItem.rhs == 'undefined' ? undefined : yaml_1.default.createNode(editItem.rhs));
        }
        else if (editItem.kind == 'D') {
            yamlDoc.deleteIn(editPath);
        }
    }
    return yamlDoc;
}
exports.patchYamlDocument = patchYamlDocument;
