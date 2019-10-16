import path from 'path';
import yaml from 'yaml';
import { diff } from 'deep-diff';

import { reorderKeys, copyReorderKeys, sortKeys, patchObject, loadAndParse, patchYamlDocument } from './utils'

const FIXTURES = path.resolve(__dirname, "..","test","__fixtures__");

expect.extend({
    toStrictOrderedEqual(received: any, actual: any) {
        try {
            expect(received).toStrictEqual(actual);
            expect(Object.getOwnPropertyNames(received)).toStrictEqual(Object.getOwnPropertyNames(actual))
        } catch (e) {
            return {
                pass: false,
                message: () => e.message
            }
        }
        return {
            pass: true,
            message: () => `expected ${received} not to strictly equal ${actual}`
        }
    }
});

declare global {
    namespace jest {
        interface Matchers<R> {
            toStrictOrderedEqual(actual: any): R;
        }
    }
}

function getTestData() {
    const testData = {
        obj1: {
            foo: 5,
            bar: 10,
        },
        obj2: {
            bar: 10,
            foo: 5,
        }
    }
    return JSON.parse(JSON.stringify(testData)) as typeof testData;
}

describe("reorderKeys", ()=>{
    it("orders keys", ()=>{
        const { obj1, obj2 } = getTestData();
        expect(obj1).not.toStrictOrderedEqual(obj2); // testing ordering
        expect(reorderKeys(obj2, ["foo","bar"])).toStrictOrderedEqual(obj1);
    });

    it("mutates its argument", ()=>{
        const { obj1, obj2 } = getTestData();
        reorderKeys(obj2, ["foo","bar"]);
        expect(obj2).toStrictOrderedEqual(obj1);
    });

    it("returns the passed object", ()=>{
        const { obj2 } = getTestData();
        expect(reorderKeys(obj2, ["foo","bar"])).toBe(obj2);
    });
});

describe("copyReorderKeys", ()=>{
    it("orders keys", ()=>{
        const { obj1, obj2 } = getTestData();
        expect(obj1).not.toStrictOrderedEqual(obj2); // testing ordering
        expect(copyReorderKeys(obj2, ["foo","bar"])).toStrictOrderedEqual(obj1);
    });

    it("does not mutate its argument", ()=>{
        const { obj2 } = getTestData();
        copyReorderKeys(obj2, ["foo","bar"]);
        expect(obj2).toStrictOrderedEqual(getTestData().obj2);
    });

    it("returns a new object", ()=>{
        const { obj2 } = getTestData();
        expect(copyReorderKeys(obj2, ["foo","bar"])).not.toBe(obj2);
    });
});

describe("sortKeys", ()=>{
    it("sorts keys", ()=>{
        const { obj1, obj2 } = getTestData();
        expect(sortKeys(obj1)).toStrictOrderedEqual(obj2);
    });

    it("mutates its argument and returns it", ()=>{
        const { obj1, obj2 } = getTestData();
        expect(sortKeys(obj1)).toBe(obj1);
        expect(obj1).toStrictOrderedEqual(obj2);
    });
});

describe('loadAndParse', () => {
    it('reads a valid JSON file', () => {
        const parsed = loadAndParse(path.resolve(FIXTURES,'valid.json'), JSON.parse);
        const required = require(path.resolve(FIXTURES,'valid.json'));
        expect(parsed).toStrictEqual(required);
    });
    it('reads a valid YAML file', () => {
        const parsed = loadAndParse(path.resolve(FIXTURES,'valid.yaml'), yaml.parse);
        const required = require(path.resolve(FIXTURES,'valid.json'));
        expect(parsed).toStrictEqual(required);
    });
    it('fails on file not found', () => {
        expect(()=>loadAndParse(path.resolve(FIXTURES,'notfound.json'), JSON.parse, false)).toThrow();
    });
    it('fails on JSON parse error', () => {
        expect(()=>loadAndParse(path.resolve(FIXTURES,'invalid.json'), JSON.parse, false)).toThrow();
    });
    it('inhibits errors on request', () => {
        expect(()=>loadAndParse(path.resolve(FIXTURES,'notfound.json'), JSON.parse, true)).not.toThrow();
        expect(()=>loadAndParse(path.resolve(FIXTURES,'invalid.json'), JSON.parse, true)).not.toThrow();
    });
    it('defaults to no inhibit', () => {
        expect(()=>loadAndParse(path.resolve(FIXTURES,'notfound.json'), JSON.parse)).toThrow();
    });
});

describe('patchObject', () => {
    function testPatch<T,U>(obj1:T, obj2:U) {
        const odiff = diff(obj1, obj2);
        expect(patchObject(obj1, odiff!)).toBe(obj1);
        expect(obj1).toStrictEqual(obj2);
    }

    it.each`
    name                           | from            | to
    ${'returns on null'}           | ${{a:1}}        | ${{a:1}}
    ${'adds a property'}           | ${{a:1}}        | ${{a:1,b:2}}
    ${'removes a property'}        | ${{a:1,b:2}}    | ${{a:1}}
    ${'changes a property'}        | ${{a:1,b:2}}    | ${{a:1,b:3}}
    ${'adds an index'}             | ${[1]}          | ${[1,2]}
    ${'deletes an index'}          | ${[1,2]}        | ${[1]}
    ${'changes an index'}          | ${[1,2]}        | ${[1,3]}
    ${'inserts an index'}          | ${[1,3]}        | ${[1,2,3]}
    ${'deletes an inside index'}   | ${[1,2,3]}      | ${[1,,3]}
    ${'deletes two indices'}       | ${[1,2,3]}      | ${[1]}
    `("$name", ({from,to})=>testPatch(from,to));
});

describe('patchYamlDocument', () => {
    function testPatch(yaml1:string, yaml2:string) {
        yaml1 += '\n';
        yaml2 += '\n';
        const doc1 = yaml.parseDocument(yaml1);
        const doc2 = yaml.parseDocument(yaml2);
        expect(doc1.toString()).toEqual(yaml1); // verify it stringifies properly
        expect(doc2.toString()).toEqual(yaml2);
        const odiff = diff(doc1.toJSON(), doc2.toJSON());
        expect(patchYamlDocument(doc1, odiff!)).toBe(doc1); // should return its argument
        expect(doc1.toJSON()).toStrictEqual(doc2.toJSON()); // should be semantically correct
        expect(doc1.toString()).toEqual(yaml2); // should maintain syntax
    }

    it.each`
    name                                            | from                   | to
    ${'changes a value'}                            | ${'a'}                 | ${'b'}
    ${'adds to a list'}                             | ${'- a'}               | ${'- a\n- b'}
    ${'changes a list'}                             | ${'- a'}               | ${'- b'}
    ${'adds to an object'}                          | ${'a: 1'}              | ${'a: 1\nb: 2'}
    ${'changes an object'}                          | ${'a: 1\nb: 2'}        | ${'a: 1\nb: 3'}
    ${'maintains inline comments on object add'}    | ${'a: 1 #c'}           | ${'a: 1 #c\nb: 2'}
    ${'maintains inline comments on object change'} | ${'a: 1 #c\nb: 2'}     | ${'a: 1 #c\nb: 3'}
    ${'maintains inline comments on list add'}      | ${'- a #c'}            | ${'- a #c\n- b'}
    ${'maintains spacing on add'}                   | ${'a: 1\n\nb: 2'}      | ${'a: 1\n\nb: 2\nc: 3'}
    ${'maintains prefix comments on add'}           | ${'a: 1\n\n#c\nb: 2'}  | ${'a: 1\n\n#c\nb: 2\nc: 3'}
    `("$name (and reverse)", ({from,to}) => {testPatch(from,to);testPatch(to,from)});
});