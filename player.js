/**
 * XObject: base class that supports events
 */
function XObject ()
{
	this.events = {};
}


/**
 * Attach an event listener
 */
XObject.prototype.addEventListener = function(evt, callback, wtf)
{
	this.events[evt].push(callback);
}


/**
 * Emit an event
 * @param evt Event name
 * @param data Event data passed to registered event listeners
 */
XObject.prototype.emitEvent = function(evt, data)
{
	for (var i = 0; i < this.events[evt].length; i++) {
		var callback = this.events[evt][i];
		callback.call(this,data);
	}
}


/**
 * Declare an event
 * @param evt Event name
 */
XObject.prototype.declareEvent = function(evt)
{
	this.events[evt] = [];
}


/**
 * PlayerEngine: Sound playing engine
 * @param tracks List of tracks
 */
function PlayerEngine(tracks)
{
	XObject.call(this);
	
	if (typeof AudioContext !== "undefined") {
		this.ctx = new AudioContext();
	} else if (typeof webkitAudioContext !== "undefined") {
		this.ctx = new webkitAudioContext();
	}
	this.buffers = [];
	this.tracks = tracks;
	this.currentTrack = 0;
	this.declareEvent('trackLoaded');
	this.declareEvent('trackChanged');
	this.playing = false;
}

PlayerEngine.prototype = Object.create(XObject.prototype);
PlayerEngine.prototype.constructor = XObject;


/**
 * Load track data from URI
 */
PlayerEngine.prototype.loadTrackFromUri = function(track,uri)
{
	var request = new XMLHttpRequest();
	request.open('GET', uri, true);
	request.responseType = 'arraybuffer';
	request.addEventListener('load', this.trackLoadedCallback.bind(this,track) , false);
	request.send();	
}


/**
 * Callback called when raw track is data has been downloaded
 */
PlayerEngine.prototype.trackLoadedCallback = function(track,evt)
{
	var req = evt.target;
    this.ctx.decodeAudioData(req.response, this.trackDecodedCallback.bind(this, track));
}


/**
 * Callback called when track data has been decoded
 */
PlayerEngine.prototype.trackDecodedCallback = function(track, buffer)
{
	var index = this.tracks.indexOf(track);

	this.buffers[index] = buffer;

	this.emitEvent('trackLoaded', {});
}


/**
 * Load all tracks data
 */
PlayerEngine.prototype.loadTracks = function()
{
	for(var i = 0; i < this.tracks.length; i++) {
		this.loadSingleTrack(i);
	}
}


/**
 * Select most suitable source URI
 */
PlayerEngine.prototype.selectTrackUri = function(track)
{
	var audio = new Audio();
	var preferred = ['audio/mp4', 'audio/ogg', 'audio/mp3'];

	/* Check preferred formats */
	for (var i in preferred) {
		var codec = preferred[i];

		var supported = audio.canPlayType(codec);
		if (codec in track.sources && supported) {
			return track.sources[codec];
		}
	}

	/* Fallback: pick first format that is likely to be playable */
	for (var codec in track.sources) {
		var supported = audio.canPlayType(codec);
		if (codec in track.sources && supported) {
			return track.sources[codec];
		}
	}

	/* FIXME last resort */
	return track.sources["audio/wav"];
}


/**
 * Load single track data
 */
PlayerEngine.prototype.loadSingleTrack = function(i)
{
	var t = this.tracks[i];
	var uri = this.selectTrackUri(t);
	this.loadTrackFromUri(t,uri);
}


/**
 * Begin playing selected track
 */
PlayerEngine.prototype.play = function()
{
	if (this.playing)
		return;

	this.playing = true;
	this.playbackCtx = [];

	for (var i = 0; i < this.tracks.length; i++) {
		var gainValue = i == this.currentTrack ? 1.0 : 0.0;

		var gain = this.ctx.createGain();
		gain.gain.value = gainValue;
		gain.connect(this.ctx.destination);
		var source = this.ctx.createBufferSource();
		source.buffer = this.buffers[i];
		source.connect(gain);
		source.start(0);

		this.playbackCtx[i] = {
			gainNode: gain,
			sourceNode: source
		};
	}

	this.playbackCtx[0].sourceNode.onended = this.onEnded.bind(this);
}


/**
 * Stop playback
 */
PlayerEngine.prototype.stop = function()
{
	if (!this.playing)
		return;

	for (var i = 0; i < this.playbackCtx.length; i++) {
		this.playbackCtx[i].sourceNode.stop(0);
	}
	this.playbackCtx = [];
}


/**
 * Callback called when playback stops
 */
PlayerEngine.prototype.onEnded = function()
{
	this.playing = false;
}


/**
 * Set current track number
 */
PlayerEngine.prototype.setCurrentTrack = function(num)
{
	var old = this.currentTrack;
	this.currentTrack = num;

	if(this.playing && this.playbackCtx && num != old) {
		this.playbackCtx[old].gainNode.gain.value = 0;
		this.playbackCtx[num].gainNode.gain.value = 1;
//		this.playbackCtx[old].gainNode.gain.setTargetAtTime(0,this.ctx.currentTime+1,0.5);
//		this.playbackCtx[num].gainNode.gain.setTargetAtTime(1,this.ctx.currentTime+1,0.5);
	}

	this.emitEvent('trackChanged', num);
}


/**
 * Player interface
 */
function PlayerView(parentNode, engine, params)
{
	this.root = null;
	this.parentNode = parentNode;
	this.engine = engine;
	this.params = params;
	this.createUI();

	this.engine.addEventListener('trackChanged', this.onTrackChanged.bind(this), false);
	this.onTrackChanged(0);
}


/**
 * Build player UI
 */
PlayerView.prototype.createUI = function()
{
	this.outerFrame = document.createElement("div");
	this.outerFrame.className = "ReampPlayerOuterFrame";
	this.parentNode.appendChild(this.outerFrame);

	this.titleDiv = document.createElement("div");
	this.titleDiv.textContent = this.params.title;
	this.outerFrame.appendChild(this.titleDiv);

	this.root = document.createElement("div");
	this.root.className = "ReampPlayerMainFrame";
	this.outerFrame.appendChild(this.root);

	var controlsDiv = document.createElement("div");
	controlsDiv.className = "Controls";
	this.root.appendChild(controlsDiv);

	var playButton = document.createElement("button");
	playButton.className = "Play";
	playButton.textContent = "\u25BA";
	playButton.addEventListener('click',this.playClicked.bind(this),false);
	controlsDiv.appendChild(playButton);

	var stopButton = document.createElement("button");
	stopButton.textContent = "\u25FC";
	stopButton.addEventListener('click',this.stopClicked.bind(this),false);
	controlsDiv.appendChild(stopButton);

	this.trackLabel = document.createElement("div");
	this.trackLabel.className = "TrackLabel";
	controlsDiv.appendChild(this.trackLabel);

	var settingsDiv = document.createElement("div");
	settingsDiv.className = "Settings";
	this.root.appendChild(settingsDiv);

	this.settingsCanvas = document.createElement("canvas");
	settingsDiv.appendChild(this.settingsCanvas);
	this.settingsCanvas.width=600;
	this.settingsCanvas.height=92;

	this.trackSelector = document.createElement("ul");
	this.trackSelector.className = "Tracks";
	this.root.appendChild(this.trackSelector);


	for (var i = 0; i < this.params.tracks.length; i++) {
		var track = this.params.tracks[i];
		var trackId = i;

		var li = document.createElement("li");
		this.trackSelector.appendChild(li);

		var img = document.createElement("img");
		img.src = track.icon;
		img.setAttribute('title', track.title);
		img.setAttribute('height', '64');
		img.addEventListener('click', this.trackSelectorClicked.bind(this,i), false);
		li.appendChild(img);
	}

	var copyright = document.createElement("div");
	copyright.className = "Copyright";
	copyright.innerHTML = 'Powered by <a href="https://github.com/elpescado/reamp-player">Reamp Player</a>';
	this.outerFrame.appendChild(copyright);

	this.redrawSettingsView(this.params.tracks[0].settings);
}


/**
 * Callback called when Play button is clicked
 */
PlayerView.prototype.playClicked = function()
{
	this.engine.play();
}


/**
 * Callback called when Stop is clicked
 */
PlayerView.prototype.stopClicked = function()
{
	this.engine.stop();
}


/**
 * Callback called when track selection button is clicked
 */ 
PlayerView.prototype.trackSelectorClicked = function(num)
{
	this.trackSelector.children[this.engine.currentTrack].classList.remove('selected');
	this.engine.setCurrentTrack(num);
}


/**
 * Callback called when track changes
 */
PlayerView.prototype.onTrackChanged = function(num)
{
	this.redrawSettingsView(this.params.tracks[num].settings);
	this.trackLabel.textContent = this.params.tracks[num].title;
	this.trackSelector.children[num].classList.add('selected');
}


/**
 * Redraw settings panel
 */
PlayerView.prototype.redrawSettingsView = function(settings)
{
	var canvas = this.settingsCanvas;
	var context = this.settingsCanvas.getContext("2d");

	var originX = 16;
	var originY = 16;
	var segmentWidth = 64;
	var knobSize = 48;


	context.clearRect ( 0 , 0 , canvas.width, canvas.height );

	var style = window.getComputedStyle(canvas);

	for (var i = 0; i < settings.length; i += 2) {
		var name = settings[i].toUpperCase();
		var value = settings[i+1];

		context.save();

		context.strokeStyle = style.color;

		context.translate(
				originX + segmentWidth * i/2+knobSize/2 + (segmentWidth-knobSize)/2,
				originY + knobSize/2
		);
		context.rotate(value * Math.PI * 1.6 + 0.2 * Math.PI);
		context.translate(-knobSize/2, -knobSize/2);

		context.beginPath();
		context.arc(knobSize/2, knobSize/2, knobSize/2, 2 * Math.PI, false);
		context.stroke();

		context.beginPath();
		context.moveTo(knobSize/2, knobSize*2/3);
		context.lineTo(knobSize/2, knobSize);
		context.stroke();

		context.restore();

		context.font = "10px Helvetica";
		var metrics = context.measureText(name);
		context.fillText(name,
				originX + i/2*segmentWidth + (segmentWidth-metrics.width)/2,
				originY + 64);
	}
}


function loadAll()
{
	var players = document.querySelectorAll(".player");
	for (var i = 0; i < players.length; i++) {
		var data = JSON.parse(players[i].querySelector("script").innerHTML);

		var e = new PlayerEngine(data.tracks);
		e.loadTracks();
		var p = new PlayerView(players[i], e, data);
	}
}
window.addEventListener('load', loadAll, false);
