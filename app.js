const bpmRange = document.querySelector("#bpmRange");
const bpmInput = document.querySelector("#bpmInput");
const bpmDisplay = document.querySelector("#bpmDisplay");
const constantTempoGroup = document.querySelector("#constantTempoGroup");
const tempoMode = document.querySelector("#tempoMode");
const tempoStart = document.querySelector("#tempoStart");
const tempoTarget = document.querySelector("#tempoTarget");
const tempoTargetGroup = document.querySelector("#tempoTargetGroup");
const tempoRangeLabel = document.querySelector("#tempoRangeLabel");
const tempoDuration = document.querySelector("#tempoDuration");
const tempoChart = document.querySelector("#tempoChart");
const tempoChartLine = document.querySelector("#tempoChartLine");
const tempoChartMarker = document.querySelector("#tempoChartMarker");
const tempoChartStart = document.querySelector("#tempoChartStart");
const tempoChartDuration = document.querySelector("#tempoChartDuration");
const tempoChartEnd = document.querySelector("#tempoChartEnd");
const timeNumerator = document.querySelector("#timeNumerator");
const timeDenominator = document.querySelector("#timeDenominator");
const clickIntervalOptions = document.querySelector("#clickIntervalOptions");
const clickInterval = {
  get value() {
    const active = clickIntervalOptions.querySelector(".is-active");
    return active ? active.dataset.value : "8";
  },
  set value(v) {
    clickIntervalOptions.querySelectorAll(".interval-btn").forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.value === String(v));
    });
  }
};
const displayDurationOptions = document.querySelector("#displayDurationOptions");
const displayDuration = {
  get value() {
    const active = displayDurationOptions.querySelector(".is-active");
    return active ? active.dataset.value : "8";
  },
  set value(v) {
    displayDurationOptions.querySelectorAll(".interval-btn").forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.value === String(v));
    });
  }
};
const tuplet = document.querySelector("#tuplet");
const rudiment = document.querySelector("#rudiment");
const straightGrid = document.querySelector("#straightGrid");
const measureStack = document.querySelector("#measureStack");
const resetButton = document.querySelector("#resetButton");
const toggleButton = document.querySelector("#toggleButton");
const status = document.querySelector("#status");

const maxMeasures = 5;
let audioContext;
let schedulerTimer;
let animationFrame;
let clickIndex = 0;
let isRunning = false;
let isPaused = false;
let measureStartTime = 0;
let nextMeasureTime = 0;
let tempoRampStartTime = 0;
let pausedTempoElapsed = 0;
let pausedMeasureElapsed = 0;
let currentTempoBpm = 100;
let selectedMeasureIndex = 0;
let currentMeasureIndex = 0;
let playheads = [];
let vexFlowApi = null;
let measures = [
  {
    beats: 4,
    beatUnit: 4,
    tupleType: null,
    rudimentId: "none",
    displayDuration: "8",
    clickInterval: "8",
    straightGrid: false,
    sound: true,
  },
];

const intervalLabels = {
  w: "whole notes",
  h: "half notes",
  q: "quarter notes",
  8: "eighth notes",
  16: "sixteenth notes",
  32: "thirty-second notes",
};
const maxDisplayedNotes = 64;
// VexFlow 4.2.6 was never published; keep these pinned to real 4.2.5 entry points.
const vexFlowModuleSources = [
  "https://cdn.jsdelivr.net/npm/vexflow@4.2.5/build/esm/entry/vexflow.js",
  "https://cdn.jsdelivr.net/npm/vexflow@4.2.5/+esm",
  "https://esm.sh/vexflow@4.2.5",
];
const vexFlowSources = [
  "https://cdn.jsdelivr.net/npm/vexflow@4.2.5/build/cjs/vexflow.js",
  "https://unpkg.com/vexflow@4.2.5/build/cjs/vexflow.js",
];

function loadScript(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = source;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${source}`));
    document.head.appendChild(script);
  });
}

async function loadVexFlow() {
  for (const source of vexFlowModuleSources) {
    try {
      const module = await import(source);
      vexFlowApi = resolveVexFlowApi(module);
      if (vexFlowApi) {
        return vexFlowApi;
      }
    } catch (error) {
      console.warn(error);
    }
  }

  for (const source of vexFlowSources) {
    try {
      await loadScript(source);
      vexFlowApi = getVexFlow();
      if (vexFlowApi) {
        return vexFlowApi;
      }
    } catch (error) {
      console.warn(error);
    }
  }

  console.warn("VexFlow could not be loaded from any configured source.");
  return null;
}

function resolveVexFlowApi(candidate) {
  if (!candidate) {
    return null;
  }

  if (candidate.Renderer && candidate.Stave && candidate.StaveNote) {
    return candidate;
  }

  if (candidate.Flow && candidate.Flow.Renderer) {
    return candidate.Flow;
  }

  if (candidate.default) {
    return resolveVexFlowApi(candidate.default);
  }

  return null;
}

function getVexFlow() {
  if (vexFlowApi) {
    return vexFlowApi;
  }

  return resolveVexFlowApi(window.Vex) || resolveVexFlowApi(window.VexFlow);
}

function clampBpm(value) {
  return Math.min(240, Math.max(40, Number.parseInt(value, 10) || 100));
}

function clampDurationMinutes(value) {
  return Math.min(120, Math.max(1, Number.parseFloat(value) || 10));
}

function getTempoSettings() {
  const constantBpm = clampBpm(bpmInput.value);
  const startBpm = clampBpm(tempoStart.value);
  const targetBpm = clampBpm(tempoTarget.value);
  return {
    mode: tempoMode.value,
    constantBpm,
    startBpm,
    targetBpm,
    lowBpm: Math.min(startBpm, targetBpm),
    highBpm: Math.max(startBpm, targetBpm),
    durationSeconds: clampDurationMinutes(tempoDuration.value) * 60,
  };
}

function getTempoProgressAtTime(time) {
  const { mode, durationSeconds } = getTempoSettings();
  if (mode === "constant") {
    return 0;
  }

  const elapsed = isPaused ? pausedTempoElapsed : Math.max(0, time - tempoRampStartTime);
  if (mode === "ramp") {
    return Math.min(1, elapsed / durationSeconds);
  }

  return (elapsed % durationSeconds) / durationSeconds;
}

function getTempoBpmAtTime(time) {
  const { mode, constantBpm, startBpm, targetBpm, lowBpm, highBpm } = getTempoSettings();
  const progress = getTempoProgressAtTime(time);
  if (mode === "constant") {
    return constantBpm;
  }

  if (mode === "ramp") {
    return startBpm + (targetBpm - startBpm) * progress;
  }

  const triangleProgress = progress <= 0.5 ? progress * 2 : (1 - progress) * 2;
  return lowBpm + (highBpm - lowBpm) * triangleProgress;
}

function setDisplayedBpm(value) {
  const bpm = Math.round(value);
  bpmDisplay.textContent = bpm;
}

function clampNumerator(value) {
  return Math.min(32, Math.max(2, Number.parseInt(value, 10) || 4));
}

function getTimeSignature(measure = null) {
  if (measure) {
    return {
      beats: measure.beats,
      beatUnit: measure.beatUnit,
    };
  }

  return {
    beats: clampNumerator(timeNumerator.value),
    beatUnit: Number(timeDenominator.value),
  };
}

function getIntervalValue(duration) {
  const namedValues = {
    w: 1,
    h: 2,
    q: 4,
  };
  return namedValues[duration] || Number(duration);
}

function getMeasureUnits(beats, beatUnit) {
  return beats * (32 / beatUnit);
}

function getSelectedTuplet(measure = null) {
  if (measure) {
    return measure.tupleType;
  }

  return tuplet.value === "none" ? null : Number(tuplet.value);
}

function getNextLowerPowerOf2(value) {
  return Math.pow(2, Math.floor(Math.log2(value - 1 || 1)));
}

function getDurationUnits(duration, tupletValue = null) {
  // Use 32nd notes as the integer base unit so 4/8/16/32 denominators stay exact.
  const baseUnits = 32 / getIntervalValue(duration);
  return tupletValue ? baseUnits * (getNextLowerPowerOf2(tupletValue) / tupletValue) : baseUnits;
}

function getDurationFromUnits(units) {
  const durationsByUnit = {
    32: "w",
    16: "h",
    8: "q",
    4: "8",
    2: "16",
    1: "32",
  };
  return durationsByUnit[units];
}

function getRemainderEvents(startUnits, remainderUnits) {
  const events = [];
  let currentUnits = startUnits;
  let remainingUnits = Math.round(remainderUnits);

  [32, 16, 8, 4, 2, 1].forEach((units) => {
    while (remainingUnits >= units) {
      events.push({
        duration: getDurationFromUnits(units),
        durationUnits: units,
        isNote: false,
        startUnits: currentUnits,
      });
      currentUnits += units;
      remainingUnits -= units;
    }
  });

  return events;
}

function getSilentEvents(beats, beatUnit) {
  // Silent measures still render visible rests so the playhead has notation to cross.
  const duration = beatUnit === 4 ? "q" : String(beatUnit);
  const durationUnits = getDurationUnits(duration);
  return Array.from({ length: beats }, (_, index) => {
    return {
      duration,
      durationUnits,
      isNote: false,
      startUnits: index * durationUnits,
    };
  });
}

function getClickEvents(beats, beatUnit, duration, tupletValue, tupleDuration = duration) {
  const measureUnits = getMeasureUnits(beats, beatUnit);
  if (tupletValue) {
    const clickValue = getIntervalValue(duration);
    const tupleBaseValue = getIntervalValue(tupleDuration);
    if (clickValue < tupleBaseValue) {
      return getClickEvents(beats, beatUnit, duration, null);
    }

    // Tuple-aware clicks are anchored to Tuple Value. Coarser clicks stay straight;
    // equal/finer clicks land on tuple notes or even subdivisions inside them.
    const subdivisionsPerTupleNote = clickValue / tupleBaseValue;
    const groupUnits = getDurationUnits(tupleDuration) * getNextLowerPowerOf2(tupletValue);
    const noteUnits = groupUnits / tupletValue;
    const clickUnits = noteUnits / subdivisionsPerTupleNote;
    const clicksPerGroup = tupletValue * subdivisionsPerTupleNote;
    const groupCount = Math.floor(measureUnits / groupUnits);
    return Array.from({ length: groupCount * clicksPerGroup }, (_, index) => {
      const groupIndex = Math.floor(index / clicksPerGroup);
      const clickIndex = index % clicksPerGroup;
      return {
        duration,
        durationUnits: clickUnits,
        isClick: true,
        startUnits: groupIndex * groupUnits + clickIndex * clickUnits,
      };
    });
  }

  const clickUnits = getDurationUnits(duration);
  const clickCount = Math.floor(measureUnits / clickUnits);
  return Array.from({ length: clickCount }, (_, index) => {
    return {
      duration,
      durationUnits: clickUnits,
      isClick: true,
      startUnits: index * clickUnits,
    };
  });
}

function getDisplayEvents(beats, beatUnit, duration, tupletValue) {
  const measureUnits = getMeasureUnits(beats, beatUnit);
  const groupUnits = tupletValue ? getDurationUnits(duration) * getNextLowerPowerOf2(tupletValue) : null;
  const noteUnits = tupletValue ? groupUnits / tupletValue : getDurationUnits(duration);
  const groupCount = tupletValue ? Math.floor(measureUnits / groupUnits) : null;
  const noteCount = tupletValue ? groupCount * tupletValue : Math.floor(measureUnits / noteUnits);
  const events = Array.from({ length: noteCount }, (_, index) => {
    const groupIndex = tupletValue ? Math.floor(index / tupletValue) : null;
    const tupletIndex = tupletValue ? index % tupletValue : null;
    return {
      duration,
      durationUnits: noteUnits,
      isNote: true,
      startUnits: tupletValue ? groupIndex * groupUnits + tupletIndex * noteUnits : index * noteUnits,
      tuplet: tupletValue,
      tupletGroup: groupIndex,
      tupletIndex,
    };
  });
  const usedUnits = tupletValue ? groupCount * groupUnits : noteCount * noteUnits;
  const remainderUnits = measureUnits - usedUnits;
  return events.concat(getRemainderEvents(usedUnits, remainderUnits));
}

function isUsableClickInterval(beats, beatUnit, duration, useStraightGrid = straightGrid.checked, tupletValue = getSelectedTuplet()) {
  const clickTupletValue = useStraightGrid ? null : tupletValue;
  return getClickEvents(beats, beatUnit, duration, clickTupletValue, displayDuration.value).length > 0;
}

function isUsableDisplayDuration(beats, beatUnit, duration) {
  const events = getDisplayEvents(beats, beatUnit, duration, getSelectedTuplet());
  return events.some((event) => event.isNote) && events.length <= maxDisplayedNotes;
}

function getSelectedMeasure() {
  return measures[selectedMeasureIndex];
}

function loadSelectedMeasureControls() {
  const measure = getSelectedMeasure();
  timeNumerator.value = measure.beats;
  timeDenominator.value = measure.beatUnit;
  tuplet.value = measure.tupleType || "none";
  rudiment.value = measure.rudimentId || "none";
  
  if (measure.displayDuration) {
    displayDuration.value = measure.displayDuration;
  } else if (measure.tupleValue) {
    displayDuration.value = measure.tupleValue;
    measure.displayDuration = measure.tupleValue;
  } else {
    displayDuration.value = measure.clickInterval || "8";
  }
  
  const isRudiment = rudiment.value !== "none";
  displayDurationOptions.style.opacity = isRudiment ? "0.3" : "1";
  displayDurationOptions.style.pointerEvents = isRudiment ? "none" : "auto";
  tuplet.disabled = isRudiment;
  
  clickInterval.value = measure.clickInterval;
  straightGrid.checked = Boolean(measure.straightGrid);
  syncTimeSignature();
}

function saveControlsToSelectedMeasure() {
  const measure = getSelectedMeasure();
  measure.beats = clampNumerator(timeNumerator.value);
  measure.beatUnit = Number(timeDenominator.value);
  measure.tupleType = getSelectedTuplet();
  measure.rudimentId = rudiment.value;
  measure.displayDuration = displayDuration.value;
  measure.clickInterval = clickInterval.value;
  measure.straightGrid = straightGrid.checked;
}

function syncTimeSignature() {
  timeNumerator.value = clampNumerator(timeNumerator.value);
  const selectedTuplet = getSelectedTuplet();
  straightGrid.disabled = !selectedTuplet;
  if (!selectedTuplet) {
    straightGrid.checked = false;
  }
  syncRhythmOptions();
  syncTempoTarget();
  syncTempoDuration();
}

function syncIntervalButtons(container, valueObj, validationFn) {
  const { beats, beatUnit } = getTimeSignature();
  const options = Array.from(container.querySelectorAll(".interval-btn"));
  let selectedIsValid = false;

  options.forEach((option) => {
    const isValid = validationFn(beats, beatUnit, option.dataset.value);
    option.disabled = !isValid;
    selectedIsValid = selectedIsValid || (option.classList.contains("is-active") && isValid);
  });

  if (!selectedIsValid) {
    const firstValidOption = options.find((option) => !option.disabled);
    if (firstValidOption) {
      valueObj.value = firstValidOption.dataset.value;
    }
  }
}

function syncRhythmOptions() {
  syncIntervalButtons(displayDurationOptions, displayDuration, isUsableDisplayDuration);
  syncIntervalButtons(clickIntervalOptions, clickInterval, isUsableClickInterval);
}

function getPattern(measure = getSelectedMeasure()) {
  const { beats, beatUnit } = getTimeSignature(measure);
  const clickDuration = measure.clickInterval;
  const quarterNotesPerBar = beats * (4 / beatUnit);
  const tupletValue = getSelectedTuplet(measure);
  const displayDuration = measure.sound ? (measure.displayDuration || measure.tupleValue || clickDuration) : null;
  
  let events = measure.sound
    ? getDisplayEvents(beats, beatUnit, displayDuration, tupletValue)
    : getSilentEvents(beats, beatUnit);

  if (measure.sound && measure.rudimentId && measure.rudimentId !== "none" && typeof PAS_RUDIMENTS !== "undefined") {
    const rudimentData = PAS_RUDIMENTS.find(r => r.id === measure.rudimentId);
    if (rudimentData && rudimentData.pattern.length === events.length) {
      events = events.map((event, index) => ({
        ...event,
        ...rudimentData.pattern[index]
      }));
    }
  }

  const clickEvents = measure.sound
    ? getClickEvents(beats, beatUnit, clickDuration, measure.straightGrid ? null : tupletValue, displayDuration)
    : [];
  const clickCount = clickEvents.length;
  return {
    beats,
    beatUnit,
    duration: displayDuration || "q",
    clickDuration,
    tuplet: tupletValue,
    quarterNotesPerBar,
    events,
    clickEvents,
    clickCount,
    measureUnits: getMeasureUnits(beats, beatUnit),
    sound: measure.sound,
  };
}

function getMeasureSeconds(measure = measures[currentMeasureIndex]) {
  const pattern = getPattern(measure);
  const secondsPerQuarter = 60 / currentTempoBpm;
  return pattern.quarterNotesPerBar * secondsPerQuarter;
}

function getBeamGroupSize(pattern) {
  if (["w", "h", "q"].includes(pattern.duration)) {
    return 1;
  }

  if (pattern.tuplet) {
    return pattern.tuplet;
  }

  const noteValue = Number(pattern.duration);
  const isCompoundEighth = pattern.beatUnit === 8 && pattern.beats % 3 === 0;
  const groupSize = isCompoundEighth ? (noteValue / 8) * 3 : noteValue / pattern.beatUnit;
  return Math.max(2, Math.round(groupSize));
}

function getBeamGroups(VF, pattern, tickables) {
  const groupSize = getBeamGroupSize(pattern);
  const beams = [];
  let group = [];

  function flushGroup() {
    for (let index = 0; index + groupSize <= group.length; index += groupSize) {
      const notes = group.slice(index, index + groupSize);
      if (notes.length > 1) {
        beams.push(new VF.Beam(notes));
      }
    }
    group = [];
  }

  pattern.events.forEach((event, index) => {
    if (!event.isNote || event.duration === "q") {
      flushGroup();
      return;
    }

    group.push(tickables[index]);
  });

  flushGroup();
  return beams;
}

function renderNotationError(container, measureIndex, error) {
  const message = typeof error === "string" ? error : (error && error.message) || "Notation could not be rendered.";
  const errorElement = document.createElement("div");
  playheads[measureIndex] = null;
  container.innerHTML = "";
  errorElement.className = "notation-error";
  errorElement.textContent = `Notation error: ${message}`;
  container.appendChild(errorElement);
}

function setPlayheadSpan(measureIndex, container, startX, endX) {
  const bar = container.querySelector(".playhead-bar");
  playheads[measureIndex] = bar ? { bar, startX, endX } : null;

  if (playheads[measureIndex] && (isRunning || isPaused) && measureIndex === currentMeasureIndex) {
    playheads[measureIndex].bar.classList.add("is-running");
    updatePlayhead();
  }
}

function getTickableXs(tickables) {
  return tickables
    .map((tickable) => typeof tickable.getAbsoluteX === "function" ? tickable.getAbsoluteX() : NaN)
    .filter(Number.isFinite);
}

function getNotationSpan(tickables, defaultStartX = 126, defaultEndX = 710, pattern = null) {
  const tickableXs = getTickableXs(tickables);
  const startX = tickableXs[0] || defaultStartX;
  const lastX = tickableXs[tickableXs.length - 1];
  const previousX = tickableXs[tickableXs.length - 2];

  let finalStep = Number.isFinite(lastX) && Number.isFinite(previousX) ? lastX - previousX : 56;

  if (pattern && pattern.events.length >= 2 && tickables.length === pattern.events.length) {
    const lastEvent = pattern.events[pattern.events.length - 1];
    const previousEvent = pattern.events[pattern.events.length - 2];

    const previousDurationUnits = lastEvent.startUnits - previousEvent.startUnits;
    const lastDurationUnits = pattern.measureUnits - lastEvent.startUnits;

    if (previousDurationUnits > 0 && lastDurationUnits > 0) {
      finalStep = finalStep * (lastDurationUnits / previousDurationUnits);
    }
  }

  const endX = Number.isFinite(lastX) ? lastX + finalStep : defaultEndX;
  return { startX, endX, finalStep };
}

function addPlayheadToRenderedSvg(container, tickables, measureIndex, defaultStartX = 126, defaultEndX = 710, pattern = null, stave = null) {
  const svg = container.querySelector("svg");

  if (!svg) {
    playheads[measureIndex] = null;
    return;
  }

  const { startX, endX } = getNotationSpan(tickables, defaultStartX, defaultEndX, pattern);
  const bar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bar.setAttribute("class", "playhead-bar");
  bar.setAttribute("x", String(startX - 9));

  let barY = 8;
  let barHeight = 80;
  if (stave && typeof stave.getYForLine === "function") {
    const topY = stave.getYForLine(0);
    const bottomY = stave.getYForLine(4);
    barY = topY - 20;
    barHeight = (bottomY - topY) + 32;
  }

  bar.setAttribute("y", String(barY));
  bar.setAttribute("width", "18");
  bar.setAttribute("height", String(barHeight));
  bar.setAttribute("rx", "4");
  bar.setAttribute("fill", "#2471a3");
  bar.setAttribute("fill-opacity", "0.22");
  svg.insertBefore(bar, svg.firstChild);
  setPlayheadSpan(measureIndex, container, startX, endX);
}

function renderNotation(measureIndex) {
  const container = measureStack.querySelector(`[data-notation-index="${measureIndex}"]`);
  if (!container) {
    return;
  }

  container.innerHTML = "";
  playheads[measureIndex] = null;

  const measure = measures[measureIndex];
  const pattern = getPattern(measure);

  const VF = getVexFlow();
  if (!VF) {
    renderNotationError(container, measureIndex, "VexFlow did not load.");
    return;
  }

  try {
    const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
    renderer.resize(760, 92);

    const context = renderer.getContext();
    const stave = new VF.Stave(36, 10, 700);
    stave.addTimeSignature(`${pattern.beats}/${pattern.beatUnit}`);
    stave.setContext(context);

    const tickables = pattern.events.map((event) => {
      const noteOptions = {
        keys: ["b/4"],
        duration: event.isNote ? event.duration : `${event.duration}r`,
      };

      if (event.isNote) {
        noteOptions.stem_direction = 1;
      }

      const note = new VF.StaveNote(noteOptions);
      if (event.isNote) {
        if (event.stick) {
          note.addModifier(new VF.Annotation(event.stick).setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM), 0);
        }
        if (event.accent) {
          note.addModifier(new VF.Articulation("a>").setPosition(VF.Modifier.Position.ABOVE), 0);
        }
        if (event.flam) {
          const grace = new VF.GraceNote({ keys: ["b/4"], duration: "8", slash: true });
          grace.setStemDirection(1);
          if (event.flamSticking) {
            grace.addModifier(new VF.Annotation(event.flamSticking).setFont("Arial", 8).setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM), 0);
          }
          const graceGroup = new VF.GraceNoteGroup([grace], true);
          note.addModifier(graceGroup, 0);
        }
        if (event.drag) {
          const grace1 = new VF.GraceNote({ keys: ["b/4"], duration: "16", slash: false });
          const grace2 = new VF.GraceNote({ keys: ["b/4"], duration: "16", slash: false });
          grace1.setStemDirection(1);
          grace2.setStemDirection(1);
          if (event.dragSticking) {
             grace1.addModifier(new VF.Annotation(event.dragSticking[0]).setFont("Arial", 8).setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM), 0);
             grace2.addModifier(new VF.Annotation(event.dragSticking[1]).setFont("Arial", 8).setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM), 0);
          }
          const graceGroup = new VF.GraceNoteGroup([grace1, grace2], true);
          if (typeof graceGroup.beamNotes === "function") {
            graceGroup.beamNotes();
          }
          note.addModifier(graceGroup, 0);
        }
        if (event.tremolo) {
          note.addModifier(new VF.Tremolo(event.tremolo), 0);
        }
      }
      return note;
    });

    const noteTickables = tickables.filter((tickable, index) => pattern.events[index].isNote);
    const beams = getBeamGroups(VF, pattern, tickables);
    const renderedTuplets = [];
    if (pattern.tuplet) {
      for (let start = 0; start < noteTickables.length; start += pattern.tuplet) {
        const tupletNotes = noteTickables.slice(start, start + pattern.tuplet);
        if (tupletNotes.length === pattern.tuplet) {
          renderedTuplets.push(new VF.Tuplet(tupletNotes, {
            num_notes: pattern.tuplet,
            notes_occupied: getNextLowerPowerOf2(pattern.tuplet),
          }));
        }
      }
    }

    const voice = new VF.Voice({
      num_beats: pattern.beats,
      beat_value: pattern.beatUnit,
    });

    voice.addTickables(tickables);
    new VF.Formatter().joinVoices([voice]).format([voice], 470);
    const notationSpan = getNotationSpan(tickables, stave.getNoteStartX(), 710, pattern);
    // Keep the visual staff roomy without changing the playhead/audio measure length.
    const staveEndX = notationSpan.endX + notationSpan.finalStep + 52;
    const staveWidth = Math.max(220, staveEndX - 36);
    if (typeof stave.setWidth === "function") {
      stave.setWidth(staveWidth);
    }
    const renderWidth = Math.ceil(staveWidth + 72);

    let renderHeight = 92;
    let viewBoxY = 0;
    if (typeof stave.getYForLine === "function") {
      const topY = stave.getYForLine(0);
      const bottomY = stave.getYForLine(4);
      viewBoxY = topY - 44;
      renderHeight = (bottomY - topY) + 84;
    }

    renderer.resize(renderWidth, renderHeight);
    stave.draw();
    voice.draw(context, stave);

    try {
      beams.forEach((beam) => beam.setContext(context).draw());

      renderedTuplets.forEach((renderedTuplet) => renderedTuplet.setContext(context).draw());
    } catch (decorationError) {
      console.warn(decorationError);
    }

    const svg = container.querySelector("svg");
    if (svg) {
      svg.setAttribute("width", String(renderWidth));
      svg.setAttribute("height", String(renderHeight));
      svg.setAttribute("viewBox", `0 ${viewBoxY} ${renderWidth} ${renderHeight}`);
    }

    addPlayheadToRenderedSvg(container, tickables, measureIndex, stave.getNoteStartX(), notationSpan.endX, pattern, stave);
  } catch (error) {
    console.error(error);
    renderNotationError(container, measureIndex, error);
  }
}

function describeMeasure(measure) {
  const displayVal = measure.displayDuration || measure.tupleValue || measure.clickInterval;
  const tupleText = measure.tupleType ? `${measure.tupleType}:${intervalLabels[displayVal]}` : intervalLabels[displayVal];
  return measure.sound ? `${measure.beats}/${measure.beatUnit}, ${tupleText}` : `${measure.beats}/${measure.beatUnit}, silent`;
}

function renderMeasureStack() {
  measureStack.innerHTML = measures.map((measure, index) => {
    const isSelected = index === selectedMeasureIndex ? " is-selected" : "";
    const isPlaying = isRunning && index === currentMeasureIndex ? " is-playing" : "";
    return `
            <section class="measure-row${isSelected}${isPlaying}" data-measure-index="${index}">
              <div class="measure-meta">
                <button class="measure-select" type="button" data-select-measure="${index}" aria-label="Select measure ${index + 1}">
                  <strong>Measure ${index + 1}</strong>
                  <span>${describeMeasure(measure)}</span>
                </button>
                <button class="mute-toggle" type="button" data-mute-measure="${index}" aria-label="${measure.sound ? 'Mute' : 'Unmute'} measure ${index + 1}" title="${measure.sound ? 'Mute' : 'Unmute'} measure">
                  ${measure.sound ? 
                    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>` : 
                    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`
                  }
                </button>
                <button class="delete-measure" type="button" data-delete-measure="${index}" ${measures.length === 1 ? "disabled" : ""} aria-label="Delete measure ${index + 1}" title="Delete measure">
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M4 4l8 8"></path>
                    <path d="M12 4l-8 8"></path>
                  </svg>
                </button>
              </div>
              <div class="measure-notation" data-notation-index="${index}" aria-label="Measure ${index + 1} notation"></div>
            </section>
          `;
  }).join("");

  const addButton = document.createElement("button");
  addButton.className = "add-measure";
  addButton.type = "button";
  addButton.innerHTML = `
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 3v10"></path>
            <path d="M3 8h10"></path>
          </svg>
        `;
  addButton.disabled = measures.length >= maxMeasures;
  addButton.addEventListener("click", addMeasure);
  measureStack.appendChild(addButton);

  measureStack.querySelectorAll("[data-select-measure]").forEach((button) => {
    button.addEventListener("click", () => selectMeasure(Number(button.dataset.selectMeasure)));
  });

  measureStack.querySelectorAll("[data-delete-measure]").forEach((button) => {
    button.addEventListener("click", () => deleteMeasure(Number(button.dataset.deleteMeasure)));
  });

  measureStack.querySelectorAll("[data-mute-measure]").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const index = Number(button.dataset.muteMeasure);
      measures[index].sound = !measures[index].sound;
      saveControlsToSelectedMeasure();
      renderMeasureStack();
      if (index === currentMeasureIndex && (isRunning || isPaused)) {
        restartRunningClock();
      }
    });
  });

  playheads = [];
  measures.forEach((_, index) => renderNotation(index));
  updateActiveMeasureClasses();
}

function updateActiveMeasureClasses() {
  const isTransportActive = isRunning || isPaused;
  measureStack.querySelectorAll("[data-measure-index]").forEach((row) => {
    const index = Number(row.dataset.measureIndex);
    row.classList.toggle("is-selected", index === selectedMeasureIndex);
    row.classList.toggle("is-playing", isTransportActive && index === currentMeasureIndex);
  });

  playheads.forEach((entry, index) => {
    if (entry) {
      entry.bar.classList.toggle("is-running", isTransportActive && index === currentMeasureIndex);
    }
  });
}

function selectMeasure(index) {
  saveControlsToSelectedMeasure();
  selectedMeasureIndex = index;
  loadSelectedMeasureControls();
  updateActiveMeasureClasses();
}

function addMeasure() {
  if (measures.length >= maxMeasures) {
    return;
  }

  saveControlsToSelectedMeasure();
  const clone = { ...measures[selectedMeasureIndex] };
  measures.push(clone);
  selectedMeasureIndex = measures.length - 1;
  loadSelectedMeasureControls();
  renderMeasureStack();
  restartRunningClock();
}

function deleteMeasure(index) {
  if (measures.length === 1) {
    return;
  }

  measures.splice(index, 1);
  selectedMeasureIndex = Math.min(selectedMeasureIndex, measures.length - 1);
  currentMeasureIndex = Math.min(currentMeasureIndex, measures.length - 1);
  loadSelectedMeasureControls();
  renderMeasureStack();
  restartRunningClock();
}

function syncBpm(value) {
  const bpm = clampBpm(value);
  bpmRange.value = bpm;
  bpmInput.value = bpm;
  if (!isRunning) {
    currentTempoBpm = bpm;
    setDisplayedBpm(currentTempoBpm);
  }
  updateTempoControls();
}

function syncTempoStart(value) {
  tempoStart.value = clampBpm(value);
  updateTempoControls();
}

function syncTempoTarget(value) {
  tempoTarget.value = clampBpm(value);
  updateTempoControls();
}

function syncTempoDuration(value) {
  tempoDuration.value = clampDurationMinutes(value);
  updateTempoControls();
}

function updateTempoControls() {
  const { mode, startBpm, targetBpm, lowBpm, durationSeconds } = getTempoSettings();
  const usesRamp = mode !== "constant";
  constantTempoGroup.style.display = usesRamp ? "none" : "";
  tempoTargetGroup.style.display = usesRamp ? "" : "none";
  tempoChart.classList.toggle("is-visible", usesRamp);
  tempoRangeLabel.textContent = mode === "updown" ? "Low / high BPM" : "BPM";

  if (mode === "updown") {
    tempoChartLine.setAttribute("points", "18,72 121,16 224,72");
    tempoChartStart.textContent = `${lowBpm} BPM`;
    tempoChartEnd.textContent = `${lowBpm} BPM`;
  } else {
    tempoChartLine.setAttribute("points", startBpm <= targetBpm ? "18,72 224,16" : "18,16 224,72");
    tempoChartStart.textContent = `${startBpm} BPM`;
    tempoChartEnd.textContent = `${targetBpm} BPM`;
  }

  tempoChartDuration.textContent = `${Math.round(durationSeconds / 60)} min`;
  updateTempoMarker();
}

function updateTempoMarker() {
  const { mode, startBpm, targetBpm } = getTempoSettings();
  if (mode === "constant") {
    return;
  }

  const markerTime = audioContext && (isRunning || isPaused) ? audioContext.currentTime : 0;
  if (isRunning) {
    setDisplayedBpm(getTempoBpmAtTime(markerTime));
  }

  const progress = audioContext ? getTempoProgressAtTime(markerTime) : 0;
  const x = 18 + 206 * progress;
  let y;
  if (mode === "updown") {
    y = progress <= 0.5 ? 72 - 56 * (progress * 2) : 16 + 56 * ((progress - 0.5) * 2);
  } else {
    const yStart = startBpm <= targetBpm ? 72 : 16;
    const yEnd = startBpm <= targetBpm ? 16 : 72;
    y = yStart + (yEnd - yStart) * progress;
  }

  tempoChartMarker.setAttribute("cx", String(x));
  tempoChartMarker.setAttribute("cy", String(y));
}

function getClickIndexForMeasureElapsed(measure, elapsedSeconds) {
  const pattern = getPattern(measure);
  const measureSeconds = getMeasureSeconds(measure);
  const secondsPerUnit = measureSeconds / pattern.measureUnits;
  const nextIndex = pattern.clickEvents.findIndex((event) => event.startUnits * secondsPerUnit > elapsedSeconds);
  return nextIndex === -1 ? pattern.clickEvents.length : nextIndex;
}

function setTransportButtonState() {
  toggleButton.setAttribute("aria-label", isRunning ? "Pause" : "Play");
  toggleButton.title = isRunning ? "Pause" : "Play";
  toggleButton.classList.toggle("is-running", isRunning);
}

function restartRunningClock() {
  if (!isRunning || !audioContext) {
    return;
  }

  currentMeasureIndex = Math.min(currentMeasureIndex, measures.length - 1);
  clickIndex = 0;
  measureStartTime = audioContext.currentTime + 0.06;
  currentTempoBpm = getTempoBpmAtTime(measureStartTime);
  setDisplayedBpm(currentTempoBpm);
  nextMeasureTime = measureStartTime + getMeasureSeconds(measures[currentMeasureIndex]);
  updateActiveMeasureClasses();
  updatePlayhead();
}

function playClick(time, accent) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.value = accent ? 1400 : 900;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(accent ? 0.55 : 0.32, time + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(time);
  oscillator.stop(time + 0.065);
}

function updatePlayhead() {
  const playhead = playheads[currentMeasureIndex];
  if (!isRunning || !playhead || !audioContext) {
    return;
  }

  const measureSeconds = getMeasureSeconds(measures[currentMeasureIndex]);
  const elapsed = Math.max(0, audioContext.currentTime - measureStartTime);
  const progress = Math.min(1, elapsed / measureSeconds);
  const x = playhead.startX + (playhead.endX - playhead.startX) * progress;
  playhead.bar.setAttribute("x", String(x - 9));
}

function animatePlayhead() {
  updatePlayhead();
  updateTempoMarker();
  animationFrame = window.requestAnimationFrame(animatePlayhead);
}

function scheduleClicks() {
  const lookAheadEnd = audioContext.currentTime + 0.1;

  while (true) {
    const measure = measures[currentMeasureIndex];
    const pattern = getPattern(measure);
    const measureSeconds = getMeasureSeconds(measure);
    const secondsPerUnit = measureSeconds / pattern.measureUnits;

    if (!pattern.sound || pattern.clickEvents.length === 0) {
      if (nextMeasureTime <= lookAheadEnd) {
        advancePlaybackMeasure(nextMeasureTime);
        continue;
      }
      break;
    }

    if (clickIndex >= pattern.clickEvents.length) {
      if (nextMeasureTime <= lookAheadEnd) {
        advancePlaybackMeasure(nextMeasureTime);
        continue;
      }
      break;
    }

    const clickEvent = pattern.clickEvents[clickIndex];
    // Schedule within the current measure from event positions; do not wrap the last
    // click back to the downbeat, or the next bar sounds like an extra beat.
    const clickTime = measureStartTime + clickEvent.startUnits * secondsPerUnit;
    if (clickTime >= nextMeasureTime || clickTime >= lookAheadEnd) {
      break;
    }

    playClick(clickTime, clickEvent.startUnits === 0);
    clickIndex += 1;
  }
}

function advancePlaybackMeasure(startTime) {
  const currentPlayhead = playheads[currentMeasureIndex];
  if (currentPlayhead) {
    currentPlayhead.bar.classList.remove("is-running");
    currentPlayhead.bar.setAttribute("x", String(currentPlayhead.startX - 9));
  }

  currentMeasureIndex = (currentMeasureIndex + 1) % measures.length;
  measureStartTime = startTime;
  currentTempoBpm = getTempoBpmAtTime(startTime);
  setDisplayedBpm(currentTempoBpm);
  nextMeasureTime = measureStartTime + getMeasureSeconds(measures[currentMeasureIndex]);
  clickIndex = 0;
  updateActiveMeasureClasses();
}

async function play() {
  audioContext = audioContext || new AudioContext();
  await audioContext.resume();
  saveControlsToSelectedMeasure();
  const resuming = isPaused;
  if (!resuming) {
    renderMeasureStack();
  }
  isRunning = true;

  if (resuming) {
    isPaused = false;
    measureStartTime = audioContext.currentTime - pausedMeasureElapsed;
    tempoRampStartTime = audioContext.currentTime - pausedTempoElapsed;
    currentTempoBpm = getTempoBpmAtTime(audioContext.currentTime);
    clickIndex = getClickIndexForMeasureElapsed(measures[currentMeasureIndex], pausedMeasureElapsed);
  } else {
    currentMeasureIndex = 0;
    clickIndex = 0;
    measureStartTime = audioContext.currentTime + 0.06;
    tempoRampStartTime = measureStartTime;
    currentTempoBpm = getTempoBpmAtTime(measureStartTime);
  }

  setDisplayedBpm(currentTempoBpm);
  nextMeasureTime = measureStartTime + getMeasureSeconds(measures[currentMeasureIndex]);
  setTransportButtonState();
  status.textContent = "Playing";
  updateActiveMeasureClasses();
  updatePlayhead();
  schedulerTimer = window.setInterval(scheduleClicks, 25);
  animationFrame = window.requestAnimationFrame(animatePlayhead);
}

function pause() {
  if (!isRunning || !audioContext) {
    return;
  }

  pausedMeasureElapsed = Math.max(0, audioContext.currentTime - measureStartTime);
  pausedTempoElapsed = Math.max(0, audioContext.currentTime - tempoRampStartTime);
  isRunning = false;
  isPaused = true;
  window.clearInterval(schedulerTimer);
  window.cancelAnimationFrame(animationFrame);
  setTransportButtonState();
  status.textContent = "Paused";
  updateActiveMeasureClasses();
  updateTempoMarker();
}

function resetPlayback() {
  isRunning = false;
  isPaused = false;
  window.clearInterval(schedulerTimer);
  window.cancelAnimationFrame(animationFrame);
  currentMeasureIndex = 0;
  clickIndex = 0;
  pausedMeasureElapsed = 0;
  pausedTempoElapsed = 0;
  tempoRampStartTime = 0;
  measureStartTime = 0;
  nextMeasureTime = 0;
  currentTempoBpm = getTempoBpmAtTime(0);
  setDisplayedBpm(currentTempoBpm);
  playheads.forEach((entry, index) => {
    if (entry) {
      entry.bar.classList.remove("is-running");
      entry.bar.setAttribute("x", String(entry.startX - 9));
    }
  });
  setTransportButtonState();
  status.textContent = "Ready";
  updateTempoMarker();
  updateActiveMeasureClasses();
}

function updateRhythm() {
  saveControlsToSelectedMeasure();
  syncTimeSignature();
  saveControlsToSelectedMeasure();
  renderMeasureStack();
  restartRunningClock();
}

function updateClickInterval() {
  updateRhythm();
}

function updateTempoSettings() {
  updateTempoControls();
  if (!isRunning) {
    currentTempoBpm = getTempoBpmAtTime(0);
    setDisplayedBpm(currentTempoBpm);
  }
}

bpmRange.addEventListener("input", (event) => {
  syncBpm(event.target.value);
  updateTempoSettings();
});
bpmInput.addEventListener("input", (event) => {
  syncBpm(event.target.value);
  updateTempoSettings();
});
tempoMode.addEventListener("change", updateTempoSettings);
tempoStart.addEventListener("input", (event) => {
  syncTempoStart(event.target.value);
  updateTempoSettings();
});
tempoTarget.addEventListener("input", (event) => {
  syncTempoTarget(event.target.value);
  updateTempoSettings();
});
tempoDuration.addEventListener("input", (event) => {
  syncTempoDuration(event.target.value);
  updateTempoSettings();
});
timeNumerator.addEventListener("input", updateRhythm);
timeDenominator.addEventListener("change", updateRhythm);
tuplet.addEventListener("change", updateRhythm);
straightGrid.addEventListener("change", updateRhythm);

rudiment.addEventListener("change", (event) => {
  const rudimentId = event.target.value;
  if (rudimentId !== "none" && typeof PAS_RUDIMENTS !== "undefined") {
    const rudimentData = PAS_RUDIMENTS.find(r => r.id === rudimentId);
    if (rudimentData) {
      timeNumerator.value = rudimentData.timeSignature[0];
      timeDenominator.value = rudimentData.timeSignature[1];
      tuplet.value = rudimentData.tuplet ? String(rudimentData.tuplet) : "none";
      displayDuration.value = rudimentData.grid;
    }
  }
  updateRhythm();
});
resetButton.addEventListener("click", resetPlayback);
toggleButton.addEventListener("click", async () => {
  if (isRunning) {
    pause();
  } else {
    try {
      await play();
    } catch (error) {
      console.error(error);
      resetPlayback();
      status.textContent = "Audio could not start";
    }
  }
});

function renderIntervalIcons() {
  const VF = getVexFlow();
  if (!VF) return;

  document.querySelectorAll(".interval-options").forEach(container => {
    const buttons = container.querySelectorAll(".interval-btn");
    buttons.forEach(btn => {
      const duration = btn.dataset.value;
      const renderer = new VF.Renderer(btn, VF.Renderer.Backends.SVG);
      renderer.resize(60, 80);
      const context = renderer.getContext();
      
      const note = new VF.StaveNote({
        keys: ["b/4"],
        duration: duration,
        stem_direction: duration === "w" ? undefined : 1
      });
      
      const stave = new VF.Stave(5, 5, 50);
      stave.setContext(context);
      
      const voice = new VF.Voice({ num_beats: 1, beat_value: 4 }).setStrict(false);
      voice.addTickables([note]);
      new VF.Formatter().joinVoices([voice]).format([voice], 50);
      voice.draw(context, stave);
      
      const svg = btn.querySelector("svg");
      svg.setAttribute("viewBox", "0 14 60 80");
      svg.style.width = "100%";
      svg.style.height = "100%";
      
      btn.addEventListener("click", () => {
        if (!btn.disabled) {
          if (container.id === "displayDurationOptions") {
            displayDuration.value = duration;
            updateRhythm();
          } else {
            clickInterval.value = duration;
            updateClickInterval();
          }
        }
      });
    });
  });
}

async function initializeApp() {
  if (typeof PAS_RUDIMENTS !== "undefined") {
    rudiment.innerHTML = "";
    PAS_RUDIMENTS.forEach(r => {
      const option = document.createElement("option");
      option.value = r.id;
      option.textContent = r.name;
      rudiment.appendChild(option);
    });
  }
  syncBpm(100);
  loadSelectedMeasureControls();
  renderMeasureStack();
  await loadVexFlow();
  renderIntervalIcons();
  renderMeasureStack();
}

initializeApp();
