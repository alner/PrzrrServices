var https = require('https'),
	Promise = require('promise'),
	crypto = require('crypto'),
	normalizeUrl = require('normalize-url'),
	url = require('url'),
	util = require('util'),
	fs = require('fs'),
	qsocks = require('qsocks'),
	util = require('util');

var config = require('./config'),
conf = config.configuration;

function buildUrl() {
	var url_pieces = [];
	var items = Array.prototype.slice.call(arguments);
	items.forEach(function(item){
		if(item)
			url_pieces.push(item);
	});
	return normalizeUrl(url_pieces.join('/'));
}

function makeHttpsRequest(settings, body, dataCallback){
	return new Promise(function(resolve, reject) {
		var timd,
		
		req = https.request(settings, function (res) {
			res.on('data', function (data) {
				if(dataCallback)
					resolve(dataCallback({data: data, response: res}));
				else
					resolve({data: data, response: res});
					
				if(timd)
					clearTimeout(timd);
			});
		});
	
		req.on('error', function(e) {
			reject(e);
			if(timd)
				clearTimeout(timd);			
		});
	
		if(body) {
			req.write(body);
		}
	
		req.end();
		
		timd = setTimeout(function(){
			reject(new Error("Request timeout"));
		}, parseInt(conf.get('server:requestTimeout') || 10000, 10));
	});	
}

function makeHubRequest(ticket, dataCallback) {
	var hub_url = buildUrl(
		 conf.get('server:url')
		,conf.get('server:prefix')
		,util.format('hub/?qlikTicket=%s', ticket)
	);
		
	var hostUri = url.parse(hub_url);
	
	var req_settings = {
		host: hostUri.hostname,
		port: hostUri.port,
		path: hostUri.path,
		method: 'GET',
		rejectUnauthorized: false,
		agent: false
	};
	
	// make get hub request to get session cookie
	return makeHttpsRequest(req_settings, null, dataCallback);
}

function makeWSConnection(sessionCookie, app) {	
	// open web socket connection
	var server_url = conf.get('server:url'),
	
	hostUri = url.parse(server_url),
	
	wsConfig = {
		host: hostUri.hostname,
		isSecure: server_url.indexOf('https://') !== -1,
		prefix: conf.get('server:prefix'),
		appname: app,
		rejectUnauthorized: false,
		headers: {
			"Content-Type": "application/json",
			"Cookie": sessionCookie
		}
	};
	
	//logger.info(JSON.stringify(wsConfig));				
	return qsocks.Connect(wsConfig);	
}

function makeQPSRequest(method, path, req_data){
	var req_url = buildUrl(
		conf.get('server:qps:url'),
		path),
// 		conf.get('server:prefix'),		
	
	hostUri = url.parse(req_url),
	
	xrfkey = generateXrfkey(),
	
	req_settings = {
		host: hostUri.hostname,
		port: hostUri.port,
		path: hostUri.pathname + '?' + ((hostUri.query) ? hostUri.query + '&' : '') +  'xrfkey=' + xrfkey,
		method: method,
		headers: {
			'X-Qlik-Xrfkey': xrfkey,
			'Content-Type': 'application/json'
		},
		pfx: config.getCertificate(),
		passphrase: conf.get('server:cert:passphrase'),
		rejectUnauthorized: false,
		agent: false
	};
		
	if(req_data) req_data = JSON.stringify(req_data);
	
	return new Promise(function(resolve, reject){		
		makeHttpsRequest(req_settings, req_data)
		.then(function(response){
			//var d = JSON.parse(response.data && response.data.toString());
			resolve(response.data);
		})
		.catch(function(err){
			reject(err);
		});
	});
}

function makeTicketRequest(){
	var req_data = conf.get('server:qps:params'),
	xrfkey = generateXrfkey();
	req_data.UserId = 'anonymous' + xrfkey;
		
	return new Promise(function(resolve, reject){
		makeQPSRequest('POST', 'ticket', req_data)
		.then(function(data){
			var d = JSON.parse(data && data.toString());
			if(d && d.Ticket)
				resolve({ticket: d.Ticket, xrfkey: xrfkey});
			else
				reject(d);
		})
		.catch(function(err){
			reject(err);
		});
	});		
}

function makeRedirectionHeaders(location, xrfkey, sessionCookie) {
	//var xrfkey = generateXrfkey(),
	var result = {
		'Cache-Control': 'no-cache, no-store, must-revalidate',
		'Pragma': 'no-cache',
		'Expires': 0,		
		'X-Qlik-xrfkey': xrfkey,
		Location: location
	};
	
	if(sessionCookie)
		result['Set-Cookie'] = sessionCookie;
	
	return result;
}

function makeRedirectionFor(id) {
	return new Promise(function(resolve, reject){
		var redirect_config = conf.get(util.format('redirects:%s', id));
		if(!redirect_config) 
			reject(new Error(util.format('%s not found', id)));
		else {
			var cookies,
			ticket,
			xrfkey,
			app = redirect_config.app,
			redirection_url = buildUrl(
				conf.get('server:url'),
				conf.get('server:prefix'),
				'sense/app',
				app,
				redirect_config.redirect_suffix
			);
			
			makeTicketRequest()
			.then(function(o){
				console.log(o.ticket);
				ticket = o.ticket;
				xrfkey = o.xrfkey;
				return makeHubRequest(ticket, function(o){
					// o: {data: data, response: res}
					console.log(o);
					cookies = (o.response.headers['set-cookie'])[0];
					//cookies = cookies[0].split(';')[0];
					if(redirection_url.indexOf('https://') == -1) {
						cookies = cookies.replace(/secure/gi, '');
					}
					
					//console.log(cookies);
					return makeWSConnection(cookies, app);
				});
			})
			.then(function(qsGlobal){
				return qsGlobal.openDoc(app);
			})
			.then(function(qsDoc){
				if(redirect_config.selections)
					makeSelection(qsDoc, redirect_config.selections);
					
				var headers = makeRedirectionHeaders(redirection_url, xrfkey, cookies);
				resolve(headers);				
			})
			/*
			.then(function(qsDoc){
				if(redirect_config.selections) {
				return qsDoc.getField('Год');
				}
			})
			.then(function(qsField){
				if(qsField)
					qsField.selectAll();
				
				var headers = makeRedirectionHeaders(redirection_url, xrfkey, cookies);
				resolve(headers);				
			})
			*/
			.catch(function(err){
				reject(err);
			});									
		}		
	});
}

function makeSelection(qsDoc, selections) {
	// selections - see config.json
	if(selections) {
		selections.forEach(function(s){
			if(s.field) {
				/*
				qsDoc.getFieldDescription(s.field);
				.then(function(qReturn){
					console.log(JSON.stringify(qReturn));
					isNumeric = qReturn.qIsNumeric;
					return qsDoc.getField(s.field);
				})
				*/
				return qsDoc.getField(s.field)
				.then(function(qsField){
					var values = s.values
					.map(function(value){
						var isNumeric = typeof value === "number" ? true : false;
						return {
							qText: isNumeric ? "" : value,
							qIsNumeric: isNumeric,
							qNumber: isNumeric ? value : 0
						};
					});
					
					//console.log(JSON.stringify(values));
					
					if(values && values.length > 0)
						qsField.selectValues(values, false, false);
				});				
			}
		});
		
	}	
}

function generateXrfkey(size, chars) {
	size = size || 16;
	chars = chars || 'abcdefghijklmnopqrstuwxyzABCDEFGHIJKLMNOPQRSTUWXYZ0123456789';

	var rnd = crypto.randomBytes(size), value = new Array(size), len = chars.length;

	for (var i = 0; i < size; i++) {
		value[i] = chars[rnd[i] % len]
	};

	return value.join('');
}

module.exports = {
	makeTicketRequest: makeTicketRequest,
	makeQPSRequest: makeQPSRequest,
	makeWSConnection: makeWSConnection,
	makeRedirectionFor: makeRedirectionFor,
	generateXrfkey: generateXrfkey
};