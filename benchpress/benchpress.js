/** 
 * @type {{N:Number, start:Number, duration:Number, timerOn:Number, startTimer:function(), stopTimer:function(), resetTimer:function(), nsPerOp:function():Number}}
 * @properties={typeid:35,uuid:"797221B3-A92A-4A75-A0DB-642F2748664E",variableType:-4}
 */
var Bench;

/**
 * @type {{ops: Number, duration: Number, nsPerOp: Number}}
 *
 * @properties={typeid:35,uuid:"EB3AF1B5-7570-4549-A876-5CAB3A549F52",variableType:-4}
 */
var BenchmarkResult;

/**
 * Target number of nano-seconds to run tests for.
 * @type {Number}
 *
 * @properties={typeid:35,uuid:"1CEA5B7F-4E92-4087-B0DD-71B9DD9D925D",variableType:8}
 */
var benchTime = 1e9;

/**
 * Local shortcut for high-precision timing.
 * @type {function():Number}
 * @properties={typeid:35,uuid:"56B573D2-D629-4779-8D6A-07AFEC2E834A",variableType:-4}
 */
var nanoTime = java.lang.System.nanoTime;

/**
 * @type {function(String)}
 * @properties={typeid:35,uuid:"24A46511-1436-4F39-ABC0-7E6FD91B20F9",variableType:-4}
 */
var log = function (s) { application.output(s) };


/**
 * @return {scopes.benchpress.Bench}
 * @properties={typeid:24,uuid:"4D166714-B6B1-4E65-BE8E-77F8D6395946"}
 */
function newBench() {
	
	/** @type {scopes.benchpress.Bench} */
	var b = {
		N : 0,
		start : null,
		duration : null,
		timerOn : false,
		startTimer: function() {
			if (!b.timerOn) {
				b.start = nanoTime();
				b.timerOn = true;
			}
		},
		stopTimer: function() {
			if (b.timerOn) {
				b.duration += (nanoTime() - b.start);
				b.timerOn = false;
			}
		},
		resetTimer: function() {
			if (b.timerOn) {
				b.start = nanoTime();
			}
			b.duration = 0;
		},
		nsPerOp : function() {
			if (b.N <= 0) {
				return 0;
			}
			return b.duration/b.N;
		}
	}
	return b;
}

/**
 * @param {scopes.benchpress.Bench} b
 * @param {function(scopes.benchpress.Bench)} benchmark
 * @param {Number} n 
 * 
 * @properties={typeid:24,uuid:"65E00C72-991C-4272-A96E-5EF55E673F5A"}
 */
function runNTimes(b, benchmark, n) {
	//Attempt to get consistent results across runs by suggesting
	//to the JVM that it collect garbage from previous runs
	java.lang.System.gc();
	
	b.N = n;
	b.resetTimer();
	b.startTimer();
	benchmark(b);
	b.stopTimer();
}

/**
 * @param {function(scopes.benchpress.Bench)} benchmark
 *
 * @properties={typeid:24,uuid:"553F5063-96EE-4BA2-A551-C2C240CF1D2C"}
 */
function launch(benchmark) {
	
	var b = newBench();
	
	//Run the benchmark once to start (in case it's expensive)
	var n = 1;
	runNTimes(b,benchmark,n);
	
	var last;
	while (b.duration < benchTime && n < 1e9) {
		last = n;
		
		//Predict iterations/sec
		if (b.nsPerOp() == 0) {
			n = 1e9;
		}
		else {
			n = (benchTime / b.nsPerOp())
		}
		
		// Run more iterations than we think we'll need for a second (1.5x).
        // Don't grow too fast in case we had timing errors previously.
        // Be sure to run at least one more than last time.
        n = Math.max(Math.min(n+n/2, 100*last), last+1);
        // Round up to something easy to read.
        n = roundUp(n);
        
        runNTimes(b,benchmark,n);
	}
	
	/** @type {scopes.benchpress.BenchmarkResult} */
	var result = {
		ops : n,
		duration : b.duration,
		nsPerOp : b.nsPerOp()
	}
	return result;
	
}

/**
 * Rounds a number down to the nearest power of 10.
 * @param n
 * @return {Number}
 * @properties={typeid:24,uuid:"4CAD1EB4-F416-46F4-AD2B-DD1D6B337B26"}
 */
function roundDown10(n) {
	var tens = 0
	// tens = floor(log_10(n))
	while (n >= 10) {
		n = n / 10
		tens++
	}
	// result = 10^tens
	var result = 1
	for (var i = 0; i < tens; i++) {
		result *= 10
	}
	return result
}

/**
 * Rounds x up to a number of the form [1eX, 2eX, 5eX].
 * @param n
 * @return {Number}
 * 
 * @properties={typeid:24,uuid:"838FA8B2-A943-4ECB-968E-3C7F490B89C1"}
 */
function roundUp(n) {
	var base = roundDown10(n)
	if ( n <= base ) {
		return base;
	}
	else if (n <= (2 * base)) {
		return 2 * base
	}
	else if (n <= (5 * base)) {        
		return 5 * base;
	}
	else {
		return 10 * base
	}
}

/**
 * Search across all scopes for benchmarking methods and run them
 * @properties={typeid:24,uuid:"5D1EFCD0-2C9D-4003-8C66-35F715834A85"}
 */
function runAllBenchmarks() {
	var scopeNames = solutionModel.getScopeNames();
	scopeNames.forEach(function (s) {
		var methods = solutionModel.getGlobalMethods(s).map(function(j) { return j.getName() } );
		var benchmarks = methods.filter(function (name) {
			return name.indexOf('benchmark_') == 0;
		});
		
		benchmarks.forEach(function (benchmark) {
			var result = launch(scopes[s][benchmark]);
			var time = nsToTime(result.nsPerOp);
			log([s, benchmark].join('.') + ": " + result.ops + " ops at " + time.time + " " + time.unit + "/op.");
		});
	});
}

/**
 * @param {Number} ns
 * @return {{time:Number, unit:String}}
 * @properties={typeid:24,uuid:"91A1D73E-5E6C-43A6-90B6-E8780ABCC0E7"}
 */
function nsToTime(ns) 
{
	var time;
	
	//Seconds
	time = ns/1e9;
	if (time >= 1) {
		return {
			time : time,
			unit : 's'
		};
	}
	
	//Milliseconds
	time = ns/1e6;
	if (time > 1) {
		return {
			time : time,
			unit : 'ms'
		};
	}
	
	//Nanoseconds
	return {
		time : ns,
		unit : 'ns'
	};
}