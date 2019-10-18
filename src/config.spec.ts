import path from 'path';
import { Config, ConflictResolution } from "./config";
import mockFs from 'mock-fs';
import osenv from 'osenv';

jest.mock('./log');
const mockLog = require('./log') as typeof import('./__mocks__/log');

const mockDirs = {
    etc: {
        "package-yaml.json": '{"timestampFuzz":15}',
        "package-yaml.yaml": 'backupPath: TEST_ETC',
    },
    usr_local_etc: {
        "package-yaml.json": '{"timestampFuzz":20}',
        "package-yaml.yaml": 'backupPath: TEST_USR_LOCAL_ETC',
    },
    home: {
        ".package-yaml.json": '{"timestampFuzz":25}',
        ".package-yaml.yaml": 'backupPath: TEST_HOME',
    },
    config_project: {
        "package.json": '{"pyamlTEST":{"timestampFuzz":30}}',
        "package.yaml": 'pyamlTEST:\n  backupPath: TEST_PROJECT',
    },
    invalidJson: 'INVALID',
};

const envSave:any={};
beforeEach(()=>{
    Object.assign(envSave, process.env);
    for (const prop in process.env) {
        delete process.env[prop];
    }
});
afterEach(()=>{
    mockFs.restore();
    for (const prop in process.env) {
        delete process.env[prop];
    }
    Object.assign(process.env, envSave);
    expect(mockLog.error).not.toHaveBeenCalled();
});


describe('new Config()', () => {
    it('creates default settings', () => {
        const config = new Config(false);
        expect(config).toMatchObject({
            debug: false,
            writeBackups: true,
            backupPath: ".%s~",
            timestampFuzz: 5,
            conflicts: ConflictResolution.ask,
            tryMerge: true,
            preserveOrder: true,
            defaultExtension: "yaml",
        });
        expect(mockLog.levelMock).toHaveBeenLastCalledWith("info");
    });

    it('sets debug with DEBUG_PACKAGE_YAML', () => {
        process.env.DEBUG_PACKAGE_YAML = "1";
        const config = new Config(false);
        expect(config.debug).toEqual(true);
        expect(mockLog.levelMock).toHaveBeenLastCalledWith("verbose");
    });

    it('sets conflicts with PACKAGE_YAML_FORCE', () => {
        process.env.PACKAGE_YAML_FORCE = 'json';
        expect(new Config(false).conflicts).toEqual('use-json');
        process.env.PACKAGE_YAML_FORCE = 'yaml';
        expect(new Config(false).conflicts).toEqual('use-yaml');
    });

    it('loads config files from /etc', () => {
        mockFs({
            "/etc": mockDirs.etc
        });
        const config = new Config(true);
        expect(config.timestampFuzz).toEqual(15);
        expect(config.backupPath).toEqual("TEST_ETC");
    });

    it('loads config files from /usr/local/etc', () => {
        mockFs({
            "/etc": mockDirs.etc,
            "/usr/local/etc": mockDirs.usr_local_etc,
        })
        const config = new Config(true);
        expect(config.timestampFuzz).toEqual(20);
        expect(config.backupPath).toEqual("TEST_USR_LOCAL_ETC");
    });

    it('loads config files from home', () => {
        mockFs({
            "/etc": mockDirs.etc,
            "/usr/local/etc": mockDirs.usr_local_etc,
            [osenv.home()]: mockDirs.home,
        }, {createCwd: false});
        const config = new Config(true);
        expect(config.timestampFuzz).toEqual(25);
        expect(config.backupPath).toEqual("TEST_HOME");
    });
});

describe('loadConfigFile()', () => {
    it('loads config from package.* sections', () => {
        mockFs({
            "project": mockDirs.config_project,
        });
        const config = new Config(false);
        config.loadConfigFile(path.join('project','package.json'), 'pyamlTEST');
        config.loadConfigFile(path.join('project','package.yaml'), 'pyamlTEST');
        expect(config.timestampFuzz).toEqual(30);
        expect(config.backupPath).toEqual("TEST_PROJECT");
    });

    it('errors on invalid JSON in explicit config', () => {
        mockFs(mockDirs);
        const config = new Config(false);
        expect(config.loadConfigFile("invalidJson")).toBe(null);
        expect(mockLog.error).toHaveBeenCalled();
        mockLog.error.mockClear();
    });

    it('errors silently on invalid JSON in project config', () => {
        mockFs(mockDirs);
        const config = new Config(false);
        expect(config.loadConfigFile("invalidJson", "rootElement")).toBe(null);
        expect(mockLog.error).not.toHaveBeenCalled();
    });
});