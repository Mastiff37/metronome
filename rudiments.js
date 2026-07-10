const PAS_RUDIMENTS = [
  {
    id: "none",
    name: "None"
  },
  {
    id: "single_stroke_roll",
    name: "1. Single Stroke Roll",
    timeSignature: [2, 4],
    grid: "16",
    tuplet: null,
    pattern: [
      { stick: "R" }, { stick: "L" }, { stick: "R" }, { stick: "L" },
      { stick: "R" }, { stick: "L" }, { stick: "R" }, { stick: "L" }
    ]
  },
  {
    id: "double_stroke_roll",
    name: "3. Double Stroke Roll",
    timeSignature: [2, 4],
    grid: "q",
    tuplet: null,
    pattern: [
      { stick: "RR", tremolo: 2 },
      { stick: "LL", tremolo: 2 }
    ]
  },
  {
    id: "single_paradiddle",
    name: "16. Single Paradiddle",
    timeSignature: [2, 4],
    grid: "16",
    tuplet: null,
    pattern: [
      { stick: "R", accent: true }, { stick: "L" }, { stick: "R" }, { stick: "R" },
      { stick: "L", accent: true }, { stick: "R" }, { stick: "L" }, { stick: "L" }
    ]
  },
  {
    id: "flam",
    name: "20. Flam",
    timeSignature: [2, 4],
    grid: "q",
    tuplet: null,
    pattern: [
      { stick: "R", flam: "l", flamSticking: "l" },
      { stick: "L", flam: "r", flamSticking: "r" }
    ]
  },
  {
    id: "flam_accent",
    name: "21. Flam Accent",
    timeSignature: [6, 8],
    grid: "8",
    tuplet: null,
    pattern: [
      { stick: "R", flam: "l", flamSticking: "l", accent: true }, { stick: "L" }, { stick: "R" },
      { stick: "L", flam: "r", flamSticking: "r", accent: true }, { stick: "R" }, { stick: "L" }
    ]
  },
  {
    id: "flam_tap",
    name: "22. Flam Tap",
    timeSignature: [2, 4],
    grid: "8",
    tuplet: null,
    pattern: [
      { stick: "R", flam: "l", flamSticking: "l", accent: true }, { stick: "R" },
      { stick: "L", flam: "r", flamSticking: "r", accent: true }, { stick: "L" }
    ]
  },
  {
    id: "drag",
    name: "31. Drag",
    timeSignature: [2, 4],
    grid: "q",
    tuplet: null,
    pattern: [
      { stick: "R", drag: "ll", dragSticking: ["l", "l"] },
      { stick: "L", drag: "rr", dragSticking: ["r", "r"] }
    ]
  }
];
