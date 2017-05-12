var util = require('util'),
	Promise = require('promise'),
	child_process = require('child_process'),
	request = require('request'),
	http = require('http'),	
	httpntlm = require('httpntlm'),
	path = require('path'),
	url = require('url'),
	querystring = require('querystring'),
	httpreq = require('httpreq'),
	async = require('async'),
	cookie = require('simple-cookie'),
	conf = require('../common/config'),
	logger = require('../common/logger');

// Global ticket cache	
var qlikSessionCookie;
	
// Main program
conf.load()
.then(function(configuration){
	var auth_data = configuration.get('exports:ntlm');
	var exports_url = configuration.get('exports:url');
	
	getQlikSession(exports_url + '/single/', auth_data)
	.then(function(){
		return phantom(configuration);
	})
	.catch(function(err){
		logger.error(err);
	});
	
	/*
	var port = configuration.get('local_proxy_port');	
	getQlikSession(exports_url + '/single/', auth_data)
	.then(function(){
		return startProxy(port, auth_data);
	})
	.then(function(proxy_server){
		phantom(configuration)
		.then(function(){
			// close proxy server, when all phantom tasks are finish
			proxy_server.close();
		})
		.catch(function(err){
			logger.error(err);
		});
	})
	.catch(function(err){
		logger.error(err);
	});
	*/
})
.catch(function(err){
	logger.error(err);
});	
		

function getQlikSession(url_link, auth_data) {
	return new Promise(function(resolve, reject){
			proxyRequest(url_link, auth_data).then(function(result){
				if(result.headers.location) {
					request(result.headers.location, function (error, response, body) {
						if(error) {
							logger.error(error);
							reject(error);
						} 
						else {
							logger.info(response.headers);
							var cookies = response.headers['set-cookie'];
							if(cookies) {
								var urlparsed = url.parse(url_link);								
								qlikSessionCookie = cookies[0];
								var parsedq = cookie.parse(qlikSessionCookie);
								//parsedq['path'] = '';
								//parsedq['httponly'] = '';
								parsedq['domain'] = urlparsed.hostname; 
								qlikSessionCookie = cookie.stringify(parsedq);
								logger.info(qlikSessionCookie);								 								
							}
															
							resolve(qlikSessionCookie);
						}	
					});
				} else reject(result);				
			})
			.catch(function(err){
				logger.error(err);
				reject(err);
			});		
	});
}	
		
function proxyRequest(url, auth_data) {
	return new Promise(function(resolve, reject){
			// ntlm auth workflow
			async.waterfall([
				function (callback){
			     	httpreq.get(url, {
			            headers:{
							'Connection' : 'keep-alive',
							'User-Agent': 'Super Agent Windows',
			            },
				        allowRedirects: false
			        }, callback);
			    },			
				function(res, callback){
					logger.info('res:', res);
					if(res.headers.location)
						try {
							httpntlm.get({
								url: res.headers.location,
								username: auth_data.username,
						        password: auth_data.password,
						        domain: auth_data.domain,
						        workstation: auth_data.workstation
							}, callback);
						} catch(err){
							logger.error(err);
							// ignore any errors
							callback();
						} 
					else callback(null, res);				
				}
			], function(err, result){
				if(err) reject(err)
				else resolve(result);
			});
	});	
}		
		
// local proxy uses http ntlm auth (see config.json exports:ntlm section)	
/*	
function startProxy(port, auth_data) {
	return new Promise(function(resolve, reject) {
		var server = http.createServer(function(req, gres){
			logger.info('QUERY BEFORE: ' + req.url);
			var obj = url.parse(decodeURI(req.url));
			if(!obj.query) {
				gres.statusCode = 404;
				gres.end();
				return;			
			}
						
			logger.info('QUERY: '+ obj.query);
			
			proxyRequest(obj.query, auth_data)
			.then(function(res){
				if(!res) {
					gres.statusCode = 302;
					gres.setHeader('Location', obj.query);
					gres.end();
					return;					
				}
				
				logger.info('Results');
				logger.info(res.statusCode);
			    logger.info(res.headers);
			    logger.log(res.body);
				
				if(res.statusCode == 302){
					// Redirect
					gres.statusCode = res.statusCode;
					// Get ticket
					var qlikTicket;
					var params;
					var parsed = url.parse(res.headers.location);
					if(parsed && parsed.query) {
						params = querystring.parse(parsed.query);
						if(params && params.qlikTicket)						
							qlikTicket = params.qlikTicket;
					}
					// Set redirect location					
					gres.setHeader('Location', obj.query + '&qlikTicket=' + qlikTicket);  //res.headers.location);
					gres.end();
				}
				else {
					// just redirect without qlikTicket
					gres.statusCode = 302;
					gres.setHeader('Location', obj.query);
					gres.end();
				}					
			})
			.catch(function(err){
			    if(err) {
					logger.error(err);
					gres.statusCode = 500;
					gres.end(err);
				}					
			});				
		});
		
		server.listen(port || 7777, function(){
			logger.info('Local proxy started to listen at %s %d', server.address().address, server.address().port);
			resolve(server);
		});
	});
}
*/

function phantom(configuration) {
	return new Promise(function(resolve, reject) {
			//var proxy_port = configuration.get('exports:local_proxy_port'); 
			var server = configuration.get('exports:url');
			var redirects = configuration.get('redirects');
			var redirectsKeys = Object.keys(redirects);
			var exportsPath = configuration.get('exports_path') || "";
			var exportsEngine = configuration.get('exports:engine');
			var exportsEngineScript = configuration.get('exports:engine_script');
			
			// one by one export ...
			//redirectsKeys.forEach(function(key){
			async.eachSeries(redirectsKeys, function(key, key_async_callback) {
					var redirectsData = redirects[key];
					var selectionParts = [];
					
					if(!redirectsData.exports)
						return;					
									
					if(redirectsData.selections) {
						redirectsData.selections.forEach(function(select){
							if(select.bookmark)
								selectionParts.push(util.format('bookmark=%s', select.bookmark));
							else
							if(select.field)
								selectionParts.push(util.format('select=%s,%s', select.field, select.values.join(','))); //encodeURIComponent(select.field), select.values.map(encodeURIComponent).join(',')));							
						});
					}
					
					var selections;
					if(selectionParts.length > 0)
						selections = selectionParts.join('&');
					
					//redirectsData.exports.forEach(function(exp){				
					async.eachSeries(redirectsData.exports, function(exp, async_callback) {
						var url_components = [];				
						url_components.push("appid=" + redirectsData.app);
						url_components.push("obj=" + exp.id);
						url_components.push("lang=ru");
						url_components.push("callback=test");
						url_components.push("select=clearall");
						if(selections)
							url_components.push(selections);
						
						// if local_proxy_port have been specified in config.json, then it uses local proxy server (see startProxy function)
						// otherwise it uses direct request
						//var single_url = !proxy_port ? '' : ('http://localhost:' + proxy_port  + '/?');							
						//single_url += (server.replace('https://', 'http://') + '/single/?' + url_components.join('&'));
						
						var single_url = (server.replace('https://', 'http://') + '/single/?' + url_components.join('&'));
						  
						logger.info(single_url);
						
						var filename = path.resolve(exportsPath, key + '_' + exp.id + '.' + exp.format || 'png');
										
						var cmd = util.format('%s %s \"%s\" %s "%s" %s "%s"', 
							path.resolve(exportsEngine), // ./slimerjs/slimerjs ./PhantomJS/bin/PhantomJS.exe
							path.resolve(exportsEngineScript), // 'rasterize.js'
							single_url,
							filename,
							exp.size,
							exp.zoomFactor,
							qlikSessionCookie);
						
						try {
							// run phatom process to export images
							var child = child_process.exec(cmd, {cwd: path.resolve(__dirname), timeout: 15*60*1000}, // 15 min timeout 
								function(error, stdout, stderr){							
								if(error)
									logger.error(error);							
								}
							);
							
							child.stdout.pipe(process.stdout);
							child.stderr.pipe(process.stderr);
							child.on('error', function(err) {
								logger.error(error);															
							});
							child.on('close', function(){
								logger.info(filename + ' finished.');
								async_callback();
							});
						} catch(err) {
							logger.error(err);
						}
					}, function(err){						
						//resolve();
						key_async_callback();
					});
			}, function(err){
				// All exports have just finished
				resolve();
			}); // each redirectsKeys			
	}); // Promise
}



/*
conf.load().then(function(configuration){
	var server = configuration.get('server:url');
	var redirects = configuration.get('redirects');
	var redirectsKeys = Object.keys(redirects);
	var exportsPath = configuration.get('exports_path') || "";
	redirectsKeys.forEach(function(key){
		var redirectsData = redirects[key];
		var selectionParts = [];
						
		if(redirectsData.selections) {
			redirectsData.selections.forEach(function(select){
				selectionParts.push(util.format('select=%s,%s', encodeURIComponent(select.field), select.values.map(encodeURIComponent).join(',')));
			});
		}
		
		var selections = selectionParts.join('&');
		
		if(redirectsData.exports) {
			redirectsData.exports.forEach(function(exp){												
				var url_components = [];				
				url_components.push("appid=" + redirectsData.app);
				url_components.push("obj=" + exp.id);
				url_components.push("lang=ru");
				url_components.push("callback=test");
				url_components.push("select=clearall");
				url_components.push(selections);
				
				var single_url = server.replace('https://', 'http://') + '/single/?' + url_components.join('&');  
				logger.info(single_url);
				
				var filename = path.resolve(exportsPath, key + '_' + exp.id + '.' + exp.format || 'png');
								
				var cmd = util.format('%s %s \"%s\" %s "%s" %s', 
					path.resolve('./PhantomJS/bin/PhantomJS.exe'),
					path.resolve('rasterize.js'),
					single_url,
					filename,
					exp.size,
					exp.zoomFactor);
				
				try {
					var child = child_process.exec(cmd, {cwd: path.resolve(__dirname), timeout: 15*60*1000}, // 15 min timeout 
						function(error, stdout, stderr){							
						if(error)
							logger.error(error);							
						}
					);
					
					child.stdout.pipe(process.stdout);
					child.stderr.pipe(process.stderr);
					child.on('error', function(err) {
						logger.error(err);
					});
					child.on('close', function(){
						logger.info(filename + ' extracted.');
					});
				} catch(err) {
					logger.error(err);
				}				
			});
		}
	});
})
.catch(function(err){
	logger.error(err);
});
*/