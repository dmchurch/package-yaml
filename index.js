var debug = require("debug")("npm-yaml");
var argv = require('minimist')(process.argv.slice(2));
var yaml = require('js-yaml');
var fs = require('fs');
var path = require("path");

function yamlToJsonAsync(yamlFilePath, jsonFilePath) {
  debug("converting yaml and writing (async)");
  var yamlFileData = fs.readFileSync(yamlFilePath, "utf8");
  yamlFileData = yaml.load(yamlFileData);
  yamlFileData = JSON.stringify(yamlFileData, null, 4);
  return fs.writeFileSync(jsonFilePath, yamlFileData);
}

function jsonToYamlAsync(jsonFilePath, yamlFilePath) {
  debug("converting json and writing (async)");
  var jsonFileData = fs.readFileSync(jsonFilePath, "utf8");
  jsonFileData = JSON.parse(jsonFileData);
  jsonFileData = yaml.dump(jsonFileData);
  return fs.writeFileSync(yamlFilePath, jsonFileData);
}

var projectDir = process.cwd();
var jsonFilePath = path.join(process.cwd(), "package.json");

var ymlFilePath = path.join(projectDir, "package.yml");
var yamlFilePath = path.join(projectDir, "package.yml");
var ymlFileExists = fs.existsSync(ymlFilePath);
var yamlFileExists = fs.existsSync(ymlFilePath);
var ymlOrYamlFilePath = function() {
  if (ymlFileExists) return ymlFilePath;
  if (yamlFileExists) return yamlFilePath;
  return false;
}()

if (ymlOrYamlFilePath) {
  yamlToJsonAsync(ymlOrYamlFilePath, jsonFilePath)
} else {
  jsonToYamlAsync(jsonFilePath, ymlFilePath);
}

process.on('exit', function() {
  if (ymlOrYamlFilePath) {
    var jsonFileExists = fs.existsSync(jsonFilePath);
    if (jsonFileExists) {
      jsonToYamlAsync(jsonFilePath, ymlOrYamlFilePath);
    }
  }
});
