var conf = require('nconf');
var Promise = require('promise');
var fs = require('fs');

//conf.argv().env().file({file: 'config.json'})
var certificate;

function load() {
	return new Promise(function(resolve, reject) {
		conf.file({file: '../config.json'});
		//certificate = fs.readFileSync(conf.get('server:cert:file'));
		//resolve(conf);		
		fs.readFile(conf.get('server:cert:file'), function(err, data){
			if(err) reject(err);
			
			certificate = data;
			resolve(conf);
		});
	});
}

module.exports = {
	configuration : conf,
	load : load,
	getCertificate : function getCertificate(){
		return certificate;
	}
};