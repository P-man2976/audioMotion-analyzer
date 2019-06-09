/**
 * audioMotion.js
 * A real-time graphic spectrum analyzer and audio player using Web Audio and Canvas APIs
 *
 * https://github.com/hvianna/audioMotion.js
 *
 * Copyright (C) 2018-2019 Henrique Vianna <hvianna@gmail.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */


export var mode,
	gradient,
	showBgColor,
	showLeds,
	showScale,
	highSens,
	showPeaks,
	loRes,
	fMin,
	fMax;

 	// data for drawing the analyzer bars and scale related variables
var analyzerBars, deltaX, bandWidth, barWidth, ledOptions,
	// Web Audio API related variables
	audioCtx, analyzer, bufferLength, dataArray,
	// canvas related variables
	canvas, canvasCtx, pixelRatio, animationReq, drawCallback,
	// octaves center frequencies (for X-axis scale labels)
	bands = [ 16, 31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 ],
	// gradient definitions
	gradients = {
		classic: {
			bgColor: '#111',
			colorStops: [
				{ pos:  0, color: 'hsl( 0, 100%, 50% )' },  // each color stop can specify the position (0 to 1) and color
				{ pos: .6, color: 'hsl( 60, 100%, 50% )' }, // colors may be specified in any HTML valid format
				{ pos:  1, color: 'hsl( 120, 100%, 50% )' }
			] },
		prism:   {
			bgColor: '#111',
			colorStops: [
				'hsl( 0, 100%, 50% )',    // if colorStops is an array of strings,
				'hsl( 60, 100%, 50% )',   // colors will be evenly distributed automatically
				'hsl( 120, 100%, 50% )',
				'hsl( 180, 100%, 50% )',
				'hsl( 240, 100%, 50% )',
			] },
		rainbow: {
			bgColor: '#111',
			dir: 'h', // this creates a horizontal gradient
			colorStops: [
				'hsl( 0, 100%, 50% )',
				'hsl( 60, 100%, 50% )',
				'hsl( 120, 100%, 50% )',
				'hsl( 180, 100%, 50% )',
				'hsl( 240, 100%, 50% )',
				'hsl( 300, 100%, 50% )',
				'hsl( 360, 100%, 50% )'
			]
		},

	};

/**
 * Defaults
 */
var defaults = {
			mode        : 0,	    // discrete frequencies mode
			fftSize     : 8192,		// FFT size
			freqMin     : 20,		// lowest frequency
			freqMax     : 22000,	// highest frequency
			smoothing   : 0.5,		// 0 to 0.9 - smoothing time constant
			gradient    : 'classic',
			showBgColor : true,
			showLeds    : false,
			showScale   : true,
			highSens    : false,
			showPeaks   : true,
			loRes       : false
		};


/**
 * Set visualization mode
 */
export function setMode( value = defaults.mode ) {
	mode = value;
	preCalcPosX();
}

/**
 * Set the size of the FFT performed by the analyzer node
 */
export function setFFTsize( value = defaults.fftSize ) {

	analyzer.fftSize = value;

	// update all variables that depend on the FFT size
	bufferLength = analyzer.frequencyBinCount;
	dataArray = new Uint8Array( bufferLength );

	preCalcPosX();
}

/**
 * Set desired frequency range
 */
export function setFreqRange( min = defaults.freqMin, max = defaults.freqMax ) {
	fMin = Math.min( min, max );
	fMax = Math.max( min, max );
	preCalcPosX();
}

/**
 * Set the analyzer's smoothing time constant
 */
export function setSmoothing( value = defaults.smoothing ) {
	analyzer.smoothingTimeConstant = value;
}

/**
 * Select gradient
 */
export function setGradient( value = defaults.gradient ) {
	gradient = value;
}

/**
 * Set show peaks preference
 */
export function setPeaks( value = defaults.showPeaks ) {
	showPeaks = value;
}

/**
 * Set background color preference
 */
export function setBgColor( value = defaults.showBgColor ) {
	showBgColor = value;
}

/**
 * Set LED effect
 */
export function setLeds( value = defaults.showLeds ) {
	showLeds = value;
}

/**
 * Set scale on/off
 */
export function setScale ( value = defaults.showScale ) {
	showScale = value;
}

/**
 * Adjust the analyzer's sensitivity
 *
 * @param {(boolean|number)} [min=-85] - min decibels or true for high sensitivity, false for low sensitivity
 * @param {number}           [max=-25] - max decibels
 */
export function setSensitivity( min = -85, max = -25 ) {
	if ( min === true ) {
		analyzer.minDecibels = -100;
		analyzer.maxDecibels = -30;
	}
	else if ( min === false ) {
		analyzer.minDecibels = -85;
		analyzer.maxDecibels = -25;
	}
	else {
		analyzer.minDecibels = Math.min( min, max );
		analyzer.maxDecibels = Math.max( min, max );
	}
}

/**
 * Pre-calculate the actual X-coordinate on screen for each analyzer bar
 */
function preCalcPosX() {

	var i, freq;

	deltaX = Math.log10( fMin );
	bandWidth = canvas.width / ( Math.log10( fMax ) - deltaX );

	analyzerBars = [];

	if ( mode == '0' ) {
	// discrete frequencies
 		var pos, lastPos = -1;
		let iMin = Math.floor( fMin * analyzer.fftSize / audioCtx.sampleRate ),
		    iMax = Math.round( fMax * analyzer.fftSize / audioCtx.sampleRate );
		barWidth = 1;

		for ( i = iMin; i <= iMax; i++ ) {
			freq = i * audioCtx.sampleRate / analyzer.fftSize; // frequency represented in this bin
			pos = Math.round( bandWidth * ( Math.log10( freq ) - deltaX ) ); // avoid fractionary pixel values

			// if it's on a different X-coordinate, create a new bar for this frequency
			if ( pos > lastPos ) {
				analyzerBars.push( { posX: pos, dataIdx: i, endIdx: 0, average: false, peak: 0, hold: 0, accel: 0 } );
				lastPos = pos;
			} // otherwise, add this frequency to the last bar's range
			else if ( analyzerBars.length )
				analyzerBars[ analyzerBars.length - 1 ].endIdx = i;
		}
	}
	else {
	// octave bands

		switch ( mode ) {
			case '24':
				ledOptions = { nLeds: 24, spaceV: 16, spaceH: 24 };
				break;

			case '12':
				ledOptions = { nLeds: 48, spaceV: 8, spaceH: 16 };
				break;

			case  '8':
				ledOptions = { nLeds: 64, spaceV: 6, spaceH: 10 };
				break;

			case  '4':
				ledOptions = { nLeds: 80, spaceV: 6, spaceH: 8 };
				break;

			case  '2':
				ledOptions = { nLeds: 128, spaceV: 4, spaceH: 4 };
				break;

			default:
				ledOptions = { nLeds: 128, spaceV: 3, spaceH: 4 };
		}

		ledOptions.spaceH *= pixelRatio;
		ledOptions.spaceV *= pixelRatio;
		ledOptions.ledHeight = canvas.height / ledOptions.nLeds - ledOptions.spaceV;

		// generate a table of frequencies based on the equal tempered scale
		var root24 = 2 ** ( 1 / 24 ); // for 1/24th-octave bands
		var c0 = 440 * root24 ** -114;
		var temperedScale = [];
		var prevBin = 0;

		i = 0;
		while ( ( freq = c0 * root24 ** i ) <= fMax ) {
			if ( freq >= fMin && i % mode == 0 )
				temperedScale.push( freq );
			i++;
		}

		// canvas space will be divided by the number of frequencies we have to display
		barWidth = Math.floor( canvas.width / temperedScale.length ) - 1;
		var barSpace = Math.round( canvas.width - barWidth * temperedScale.length ) / ( temperedScale.length - 1 );

		temperedScale.forEach( function( freq, index ) {
			// which FFT bin represents this frequency?
			var bin = Math.round( freq * analyzer.fftSize / audioCtx.sampleRate );

			var idx, nextBin, avg = false;
			// start from the last used FFT bin
			if ( prevBin > 0 && prevBin + 1 <= bin )
				idx = prevBin + 1;
			else
				idx = bin;

			prevBin = nextBin = bin;
			// check if there's another band after this one
			if ( temperedScale[ index + 1 ] !== undefined ) {
				nextBin = Math.round( temperedScale[ index + 1 ] * analyzer.fftSize / audioCtx.sampleRate );
				// and use half the bins in between for this band
				if ( nextBin - bin > 1 )
					prevBin += Math.round( ( nextBin - bin ) / 2 );
				else if ( nextBin - bin == 1 ) {
				// for low frequencies the FFT may not provide as many coefficients as we need, so more than one band will use the same FFT data
				// in these cases, we set a flag to perform an average to smooth the transition between adjacent bands
					if ( analyzerBars.length > 0 && idx == analyzerBars[ analyzerBars.length - 1 ].dataIdx ) {
						avg = true;
						prevBin += Math.round( ( nextBin - bin ) / 2 );
					}
				}
			}

			analyzerBars.push( {
				posX: index * ( barWidth + barSpace ),
				dataIdx: idx,
				endIdx: prevBin - idx > 0 ? prevBin : 0,
				average: avg,
				peak: 0,
				hold: 0,
				accel: 0
			} );
		} );
	}

	drawScale();
}

/**
 * Draws the x-axis scale
 */
function drawScale() {

	canvasCtx.fillStyle = '#000';
	canvasCtx.fillRect( 0, canvas.height - 20 * pixelRatio, canvas.width, 20 * pixelRatio );

	if ( ! showScale )
		return;

	canvasCtx.fillStyle = '#fff';
	canvasCtx.font = ( 10 * pixelRatio ) + 'px sans-serif';
	canvasCtx.textAlign = 'center';

	bands.forEach( function( freq ) {
		var posX = bandWidth * ( Math.log10( freq ) - deltaX );
		canvasCtx.fillText( freq >= 1000 ? ( freq / 1000 ) + 'k' : freq, posX, canvas.height - 5 * pixelRatio );
	});

}

/**
 * Redraw the canvas
 * this is called 60 times per second by requestAnimationFrame()
 */
function draw() {

	var i, j, l, bar, barHeight,
		isLedDisplay = ( showLeds && mode != '0' );

//	document.body.className = isPlaying() ? 'playing' : '';

	if ( ! showBgColor )	// use black background
		canvasCtx.fillStyle = '#000';
	else
		if ( isLedDisplay )
			canvasCtx.fillStyle = '#111';
		else
			canvasCtx.fillStyle = gradients[ gradient ].bgColor; // use background color defined by gradient

	// clear the canvas
	canvasCtx.fillRect( 0, 0, canvas.width, canvas.height );

	// get a new array of data from the FFT
	analyzer.getByteFrequencyData( dataArray );

	l = analyzerBars.length;
	for ( i = 0; i < l; i++ ) {

		bar = analyzerBars[ i ];

		if ( bar.endIdx == 0 ) 	// single FFT bin
			barHeight = dataArray[ bar.dataIdx ] / 255 * canvas.height;
		else { 					// range of bins
			barHeight = 0;
			if ( bar.average ) {
				// use the average value of the range
				for ( j = bar.dataIdx; j <= bar.endIdx; j++ )
					barHeight += dataArray[ j ];
				barHeight = barHeight / ( bar.endIdx - bar.dataIdx + 1 ) / 255 * canvas.height;
			}
			else {
				// use the highest value in the range
				for ( j = bar.dataIdx; j <= bar.endIdx; j++ )
					barHeight = Math.max( barHeight, dataArray[ j ] );
				barHeight = barHeight / 255 * canvas.height;
			}
		}

		if ( isLedDisplay ) // normalize barHeight to match one of the "led" elements
			barHeight = Math.floor( barHeight / canvas.height * ledOptions.nLeds ) * ( ledOptions.ledHeight + ledOptions.spaceV );

		if ( barHeight > bar.peak ) {
			bar.peak = barHeight;
			bar.hold = 30; // set peak hold time to 30 frames (0.5s)
			bar.accel = 0;
		}

		canvasCtx.fillStyle = gradients[ gradient ].gradient;
		if ( isLedDisplay )
			canvasCtx.fillRect( bar.posX + ledOptions.spaceH / 2, canvas.height, barWidth, -barHeight );
		else
			canvasCtx.fillRect( bar.posX, canvas.height, barWidth, -barHeight );

		if ( bar.peak > 0 ) {
			if ( showPeaks )
				if ( isLedDisplay )
					canvasCtx.fillRect( bar.posX + ledOptions.spaceH / 2, ( ledOptions.nLeds - Math.floor( bar.peak / canvas.height * ledOptions.nLeds ) ) * ( ledOptions.ledHeight + ledOptions.spaceV ), barWidth, ledOptions.ledHeight );
				else
					canvasCtx.fillRect( bar.posX, canvas.height - bar.peak, barWidth, 2 );

			if ( bar.hold )
				bar.hold--;
			else {
				bar.accel++;
				bar.peak -= bar.accel;
			}
		}

		if ( isLedDisplay ) {
			canvasCtx.fillStyle = '#000';	// clears a vertical line to the left of this bar, to separate the LED columns
			canvasCtx.fillRect( bar.posX - ledOptions.spaceH / 2, 0, ledOptions.spaceH, canvas.height );
		}

	}

	if ( isLedDisplay ) {
		canvasCtx.fillStyle = '#000';
		if ( mode > 1 )	// clears rightmost vertical line
			canvasCtx.fillRect( canvas.width - ledOptions.spaceH / 2, 0, ledOptions.spaceH, canvas.height );
		// add horizontal black lines to separate the LEDs
		for ( j = ledOptions.ledHeight; j < canvas.height; j += ledOptions.ledHeight + ledOptions.spaceV )
			canvasCtx.fillRect( 0, j, canvas.width, ledOptions.spaceV );
	}

	if ( showScale )
		drawScale();

	if ( drawCallback )
		drawCallback( canvas, canvasCtx );

	// schedule next canvas update
	animationReq = requestAnimationFrame( draw );
}


/**
 * Set canvas dimensions
 */
function setCanvas() {
	pixelRatio = window.devicePixelRatio; // for Retina / HiDPI devices

	if ( loRes )
		pixelRatio /= 2;

	// Adjust canvas width and height to match the display's resolution
	canvas.width = window.screen.width * pixelRatio;
	canvas.height = window.screen.height * pixelRatio;

	// always consider landscape orientation
	if ( canvas.height > canvas.width ) {
		var tmp = canvas.width;
		canvas.width = canvas.height;
		canvas.height = tmp;
	}

	if ( pixelRatio == 2 && canvas.height <= 1080 ) // adjustment for wrong dPR reported on Shield TV
		pixelRatio = 1;

	canvasCtx.lineWidth = 4 * pixelRatio;
	canvasCtx.lineJoin = 'round';

	// clear the canvas
	canvasCtx.fillStyle = '#000';
	canvasCtx.fillRect( 0, 0, canvas.width, canvas.height );

	// Generate gradients

	var grad, i;

	Object.keys( gradients ).forEach( function( key ) {
		if ( gradients[ key ].dir && gradients[ key ].dir == 'h' )
			grad = canvasCtx.createLinearGradient( 0, 0, canvas.width, 0 );
		else
			grad = canvasCtx.createLinearGradient( 0, 0, 0, canvas.height );

		if ( gradients[ key ].colorStops ) {
			gradients[ key ].colorStops.forEach( ( colorInfo, index ) => {
				if ( typeof colorInfo == 'object' )
					grad.addColorStop( colorInfo.pos, colorInfo.color );
				else
					grad.addColorStop( index / ( gradients[ key ].colorStops.length - 1 ), colorInfo );
			});
		}

		gradients[ key ].gradient = grad; // save the generated gradient back into the gradients array
	});

	preCalcPosX();
}

/**
 * Display the canvas in full-screen mode
 */
export function toggleFullscreen() {

	if ( document.fullscreenElement ) {
		document.exitFullscreen();
	}
	else {
		if ( canvas.requestFullscreen )
			canvas.requestFullscreen();
		else if ( canvas.webkitRequestFullscreen )
			canvas.webkitRequestFullscreen();
		else if ( canvas.mozRequestFullScreen )
			canvas.mozRequestFullScreen();
		else if ( canvas.msRequestFullscreen )
			canvas.msRequestFullscreen();
	}
}

/**
 * Connect HTML audio element to analyzer
 *
 * @param {Object} element - DOM audio element
 * @returns {Object} a MediaElementAudioSourceNode object
 */
export function connectAudio( element ) {
	var audioSource = audioCtx.createMediaElementSource( element );
	audioSource.connect( analyzer );
	return audioSource;
}

/**
 * Start canvas animation
 */
export function start() {
	if ( ! animationReq )
		animationReq = requestAnimationFrame( draw );
}

/**
 * Stop canvas animation
 */
export function stop() {
	if ( animationReq ) {
		cancelAnimationFrame( animationReq );
		animationReq = null;
	}
}

/**
 * Initialization
 */
export function create( container, options = {} ) {

	if ( ! container ) {
		throw 'Container not specified';
	}

	// Create audio context

	var AudioContext = window.AudioContext || window.webkitAudioContext;

	try {
		audioCtx = new AudioContext();
	}
	catch( err ) {
		console.log( 'Could not create audio context. Web Audio API not supported?' );
		return false;
	}

	// Create analyzer node and connect to destination

	analyzer = audioCtx.createAnalyser();

	var audioSource;
	if ( options.audioElement )
		audioSource = connectAudio( options.audioElement );

	analyzer.connect( audioCtx.destination );

	// Adjust settings

	mode        = options.mode        || defaults.mode;
	fMin        = options.freqMin     || defaults.freqMin;
	fMax        = options.freqMax     || defaults.freqMax;
	gradient    = options.gradient    || defaults.gradient;
	showBgColor = options.showBgColor || defaults.showBgColor;
	showLeds    = options.showLeds    || defaults.showLeds;
	showScale   = options.showScale   || defaults.showScale;
	highSens    = options.highSens    || defaults.highSens;
	showPeaks   = options.showPeaks   || defaults.showPeaks;
	loRes       = options.loRes       || defaults.loRes;

	analyzer.fftSize               = options.fftSize   || defaults.fftSize;
	analyzer.smoothingTimeConstant = options.smoothing || defaults.smoothing;

	setSensitivity( highSens );

	bufferLength = analyzer.frequencyBinCount;
	dataArray = new Uint8Array( bufferLength );

	// Canvas
	canvas = document.createElement('canvas');
	container.appendChild( canvas );
	canvasCtx = canvas.getContext('2d');
	setCanvas();

	// Start canvas animation
	if ( options.start !== false )
		start();

	// returns connected audio source
	return audioSource;
}


