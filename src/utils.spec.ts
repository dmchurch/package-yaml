import path from 'path';
import yaml from 'yaml';
import { diff } from 'deep-diff';

import { reorderKeys, copyReorderKeys, sortKeys, patchObject, loadAndParse, patchYamlDocument, deepCopy, recordKeyOrder, orderSymbol, restoreKeyOrder } from './utils'

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
    },

    toDeepStrictOrderedEqual(received: any, actual: any) {
        try {
            expect(received).toStrictEqual(actual);
            function checkOrdering(recv:any, act:any) {
                expect(Object.getOwnPropertyNames(recv)).toStrictEqual(Object.getOwnPropertyNames(act))
                for (const prop in recv) {
                    checkOrdering(recv[prop], act[prop]);
                }
            }
            checkOrdering(received, actual);
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
    },
});

declare global {
    namespace jest {
        interface Matchers<R> {
            toStrictOrderedEqual(actual: any): R;
            toDeepStrictOrderedEqual(actual: any): R;
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
        },
        recur: {
            a: {
                b: 2,
            }
        },
        recurArr: {
            a: [
                1,
                2,
                [
                    3,
                    4,
                ]
            ]
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

describe('deepCopy', () => {
    it('copies an object', () => {
        const obj = {};
        expect(deepCopy(obj)).not.toBe(obj);
    });

    it('maintains values', () => {
        const { obj1 } = getTestData();
        expect(deepCopy(obj1)).toStrictEqual(obj1);
    });

    it('recurses objects', () => {
        const { recur } = getTestData();
        const copy = deepCopy(recur);
        expect(copy).toStrictEqual(recur);
        expect(copy.a).not.toBe(recur.a);
    });

    it('recurses arrays', () => {
        const { recurArr } = getTestData();
        const copy = deepCopy(recurArr);
        expect(copy).toStrictEqual(recurArr);
        expect(copy.a[2]).not.toBe(recurArr.a[2]);
    });

    it('handles circular references', () => {
        const {obj1} = getTestData() as any;
        obj1.sub = obj1;
        const copy = deepCopy(obj1);
        expect(copy).toStrictEqual(obj1);
        expect(copy).not.toBe(obj1);
        expect(copy).toBe(copy.sub);
    });

    it('preserves class', () => {
        const url = new URL("file:///");
        const copy = deepCopy(url);
        expect(copy).toStrictEqual(url);
    });

    it('patches a property', () => {
        const obj = {a: 1, b: 2};
        const copy = deepCopy(obj, {a: 3});
        expect(copy).toStrictOrderedEqual({a: 3, b: 2});
    });

    it('patches an array index', () => {
        const obj = [1,2,3];
        const copy = deepCopy(obj, [,4]);
        expect(copy).toStrictEqual([1,4,3]);
    });

    it('patches an array index with an object', () => {
        const obj = [1,2,3];
        const copy = deepCopy(obj, {1:4});
        expect(copy).toStrictEqual([1,4,3]);
    });

    it('sets the length of an array on request', () => {
        const obj = [1,2,3];
        const copy = deepCopy(obj, {length:2});
        expect(copy).toStrictEqual([1,2]);
    });

    it('recurses down objects', () => {
        const obj = {a: 1, b: {c:2,d:3}};
        const copy = deepCopy(obj, {b: {c:4}});
        expect(copy).toDeepStrictOrderedEqual({a: 1, b: {c:4,d:3}});
    });

    it('recurses down arrays', () => {
        const obj = [1, {c:2,d:3}, 4];
        const copy = deepCopy(obj, [,{c:5}]);
        expect(copy).toStrictEqual([1, {c:5,d:3}, 4]);
    });

    it('overwrites an object', () => {
        const obj = {a: 1, b: {c: 2}};
        const copy = deepCopy(obj, {b: deepCopy.value({d:3})});
        expect(copy).toDeepStrictOrderedEqual({a: 1, b: {d: 3}});
    });

    it('overwrites an array', () => {
        const obj = [1,[2,3],4];
        const copy = deepCopy(obj, [,deepCopy.value([5])]);
        expect(copy).toStrictEqual([1,[5],4]);
    });
});

describe('recordKeyOrder/restoreKeyOrder', () => {
    it('saves order to invisible symbol property by default', () => {
        const { obj1 } = getTestData() as any;
        const obj1copy = deepCopy(obj1);
        const order = Object.getOwnPropertyNames(obj1);
        recordKeyOrder(obj1);
        expect(obj1[orderSymbol]).toStrictEqual(order);
        expect(obj1).toStrictEqual(obj1copy);
    });
    it('saves order to visible symbol property', () => {
        const { obj1 } = getTestData() as any;
        const obj1copy = deepCopy(obj1);
        const order = Object.getOwnPropertyNames(obj1);
        recordKeyOrder(obj1, false, true);
        expect(obj1[orderSymbol]).toStrictEqual(order);
        expect(obj1).not.toStrictEqual(obj1copy);
    });
    it('saves order to string properties', () => {
        const { obj1 } = getTestData() as any;
        const order = Object.getOwnPropertyNames(obj1);
        recordKeyOrder(obj1, false, "stringorder");
        expect(obj1.stringorder).toStrictEqual(order);
    });
    it('allows overriding descriptor properties', () => {
        const { obj1 } = getTestData() as any;
        const obj1copy = deepCopy(obj1);
        recordKeyOrder(obj1, false, false, {enumerable:true});
        expect(obj1).not.toStrictEqual(obj1copy);
    });
    it('saves and restores key order', () => {
        const { obj1 } = getTestData() as any;
        const obj1copy = deepCopy(obj1);
        recordKeyOrder(obj1);
        sortKeys(obj1);
        expect(obj1).toStrictEqual(obj1copy);
        expect(obj1).not.toStrictOrderedEqual(obj1copy);
        restoreKeyOrder(obj1);
        expect(obj1).toStrictOrderedEqual(obj1copy);
    });
    it('saves and restores key order recursively', () => {
        const obj = {
            b: 1,
            a: {
                z: 1,
                y: [
                    1,
                    2,
                    {
                        6: 1,
                        5: 2
                    }
                ]
            }
        };
        const objcopy = deepCopy(obj);
        recordKeyOrder(obj, true);
        sortKeys(obj.a);
        sortKeys(obj.a.y[2]);
        expect(obj).toStrictEqual(objcopy);
        expect(obj).toStrictOrderedEqual(objcopy);
        expect(obj).not.toDeepStrictOrderedEqual(objcopy);
        sortKeys(obj);
        expect(obj).not.toStrictOrderedEqual(objcopy);
        restoreKeyOrder(obj, true);
        expect(obj).toDeepStrictOrderedEqual(objcopy);
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
    function testPatch(yaml1:string, yaml2:string, ordered:boolean=false) {
        function maybeRecord(obj:any) {
            return ordered ? recordKeyOrder(obj, true, true): obj;
        }
        yaml1 += '\n';
        yaml2 += '\n';
        const doc1 = yaml.parseDocument(yaml1);
        const doc2 = yaml.parseDocument(yaml2);
        expect(doc1.toString()).toEqual(yaml1); // verify it stringifies properly
        expect(doc2.toString()).toEqual(yaml2);
        const odiff = diff(maybeRecord(doc1.toJSON()), maybeRecord(doc2.toJSON()));
        expect(patchYamlDocument(doc1, odiff!, ordered)).toBe(doc1); // should return its argument
        expect(doc1.toJSON()).toStrictEqual(doc2.toJSON()); // should be semantically correct
        expect(doc1.toString()).toEqual(yaml2); // should maintain syntax
    }

    it.each`
    name                                            | from                   | to
    ${'returns on null'}                            | ${'a'}                 | ${'a'}
    ${'changes a value'}                            | ${'a'}                 | ${'b'}
    ${'adds to a list'}                             | ${'- a'}               | ${'- a\n- b'}
    ${'changes a list'}                             | ${'- a'}               | ${'- b'}
    ${'adds to an object'}                          | ${'a: 1'}              | ${'a: 1\nb: 2'}
    ${'changes an object'}                          | ${'a: 1\nb: 2'}        | ${'a: 1\nb: 3'}
    ${'maintains inline comments on object add'}    | ${'a: 1 #c'}           | ${'a: 1 #c\nb: 2'}
    ${'maintains inline comments on object change'} | ${'a: 1 #c\nb: 2'}     | ${'a: 1 #c\nb: 3'}
    ${'maintains inline comments on self change'}   | ${'a: 1 #c\nb: 2'}     | ${'a: 3 #c\nb: 2'}
    ${'maintains inline comments on list add'}      | ${'- a #c'}            | ${'- a #c\n- b'}
    ${'maintains spacing on add'}                   | ${'a: 1\n\nb: 2'}      | ${'a: 1\n\nb: 2\nc: 3'}
    ${'maintains prefix comments on add'}           | ${'a: 1\n\n#c\nb: 2'}  | ${'a: 1\n\n#c\nb: 2\nc: 3'}
    `("$name (and reverse)", ({from,to}) => {testPatch(from,to);testPatch(to,from)});

    it.each`
    name                                            | from                   | to
    ${'reorders an object'}                         | ${'a: 1\nb: 2'}        | ${'b: 2\na: 1'}
    ${'reorders an object with extra keys'}         | ${'a: 1\nb: 2'}        | ${'b: 2\na: 1\nc: 3'}
    `("$name (ordered)", ({from,to}) => {testPatch(from,to,true);testPatch(to,from,true)});
});