import CPU from "./cpu";
import Keyboard from "./keyboard";
import PAPU from "./papu";
import PPU from "./ppu";
import ROM from "./rom";

export default function NES(opts) {
  this.opts = {
    onFrame: function() {},
    onAudio: null,
    onStatusUpdate: function() {},

    preferredFrameRate: 60,

    emulateSound: true,
    sampleRate: 44100 // Sound sample rate in hz
  };
  if (typeof opts !== "undefined") {
    var key;
    for (key in this.opts) {
      if (typeof opts[key] !== "undefined") {
        this.opts[key] = opts[key];
      }
    }
  }

  this.frameTime = 1000 / this.opts.preferredFrameRate;

  this.ui = {
    writeFrame: this.opts.onFrame,
    writeAudio: this.opts.onAudio,
    updateStatus: this.opts.onStatusUpdate
  };
  this.cpu = new CPU(this);
  this.ppu = new PPU(this);
  this.papu = new PAPU(this);
  this.mmap = null; // set in loadROM()
  this.keyboard = new Keyboard();

  this.ui.updateStatus("Ready to load a ROM.");
}

NES.prototype = {
  fpsFrameCount: 0,
  romData: null,

  // Resets the system
  reset: function() {
    if (this.mmap !== null) {
      this.mmap.reset();
    }

    this.cpu.reset();
    this.ppu.reset();
    this.papu.reset();

    this.lastFpsTime = null;
    this.fpsFrameCount = 0;
  },

  frame: function() {
    this.ppu.startFrame();
    var cycles = 0;
    var emulateSound = this.opts.emulateSound;
    var cpu = this.cpu;
    var ppu = this.ppu;
    var papu = this.papu;
    FRAMELOOP: for (;;) {
      if (cpu.cyclesToHalt === 0) {
        // Execute a CPU instruction
        cycles = cpu.emulate();
        if (emulateSound) {
          papu.clockFrameCounter(cycles);
        }
        cycles *= 3;
      } else {
        if (cpu.cyclesToHalt > 8) {
          cycles = 24;
          if (emulateSound) {
            papu.clockFrameCounter(8);
          }
          cpu.cyclesToHalt -= 8;
        } else {
          cycles = cpu.cyclesToHalt * 3;
          if (emulateSound) {
            papu.clockFrameCounter(cpu.cyclesToHalt);
          }
          cpu.cyclesToHalt = 0;
        }
      }

      for (; cycles > 0; cycles--) {
        if (
          ppu.curX === ppu.spr0HitX &&
          ppu.f_spVisibility === 1 &&
          ppu.scanline - 21 === ppu.spr0HitY
        ) {
          // Set sprite 0 hit flag:
          ppu.setStatusFlag(ppu.STATUS_SPRITE0HIT, true);
        }

        if (ppu.requestEndFrame) {
          ppu.nmiCounter--;
          if (ppu.nmiCounter === 0) {
            ppu.requestEndFrame = false;
            ppu.startVBlank();
            break FRAMELOOP;
          }
        }

        ppu.curX++;
        if (ppu.curX === 341) {
          ppu.curX = 0;
          ppu.endScanline();
        }
      }
    }
    this.fpsFrameCount++;
  },

  getFPS: function() {
    var now = +new Date();
    var fps = null;
    if (this.lastFpsTime) {
      fps = this.fpsFrameCount / ((now - this.lastFpsTime) / 1000);
    }
    this.fpsFrameCount = 0;
    this.lastFpsTime = now;
    return fps;
  },

  reloadROM: function() {
    if (this.romData !== null) {
      this.loadROM(this.romData);
    }
  },

  // Loads a ROM file into the CPU and PPU.
  // The ROM file is validated first.
  loadROM: function(data) {
    // Load ROM file:
    this.rom = new ROM(this);
    this.rom.load(data);

    this.reset();
    this.mmap = this.rom.createMapper();
    this.mmap.loadROM();
    this.ppu.setMirroring(this.rom.getMirroringType());
    this.romData = data;
  },

  setFramerate: function(rate) {
    this.opts.preferredFrameRate = rate;
    this.frameTime = 1000 / rate;
    this.papu.setSampleRate(this.opts.sampleRate, false);
  },

  toJSON: function() {
    return {
      romData: this.romData,
      cpu: this.cpu.toJSON(),
      mmap: this.mmap.toJSON(),
      ppu: this.ppu.toJSON()
    };
  },

  fromJSON: function(s) {
    this.loadROM(s.romData);
    this.cpu.fromJSON(s.cpu);
    this.mmap.fromJSON(s.mmap);
    this.ppu.fromJSON(s.ppu);
  }
};
