/* =================================================================
   Bell Diagnostic Coach — pt-data.js
   Pressure–Temperature (PT) lookup tables.
   -----------------------------------------------------------------
   Each refrigerant has a list of points sorted by PRESSURE (psig):
        [ psig, bubbleTempF, dewTempF ]
   - Single-component / near-azeotropic refrigerants (R-410A, R-22,
     R-32) have effectively no glide, so bubble = dew.
   - R-454B is a zeotropic blend with ~2°F glide, so bubble and dew
     differ. Convention: use the DEW point for suction-side
     (superheat) and the BUBBLE point for liquid-side (subcooling).

   HOW TO EDIT / VERIFY:
   These are reference values compiled from published manufacturer
   PT charts (values current as of 2026). Treat them as a field aid,
   not gospel — always confirm against the equipment data plate or
   the manufacturer's chart before charging. To update a refrigerant,
   just replace its points array below with values from your trusted
   source, keeping the [psig, bubbleF, dewF] format sorted by psig.
   ================================================================= */

const PT_DATA = {
  // R-410A — near-azeotropic (glide < 0.3°F). Single saturation value.
  "R-410A": {
    glide: false, glideF: 0,
    note: "Near-azeotropic; a single saturation value is used.",
    points: [
      [11.6, -40, -40], [14.9, -35, -35], [18.5, -30, -30], [22.5, -25, -25],
      [26.9, -20, -20], [31.7, -15, -15], [36.8, -10, -10], [42.5, -5, -5],
      [48.6, 0, 0], [55.2, 5, 5], [62.3, 10, 10], [70.0, 15, 15],
      [78.3, 20, 20], [87.3, 25, 25], [96.8, 30, 30], [107.0, 35, 35],
      [118.0, 40, 40], [130.0, 45, 45], [142.0, 50, 50], [155.6, 55, 55],
      [170.4, 60, 60], [185.7, 65, 65], [201.0, 70, 70], [217.0, 75, 75],
      [235.0, 80, 80], [254.0, 85, 85], [274.0, 90, 90], [295.0, 95, 95],
      [317.0, 100, 100], [340.0, 105, 105], [365.0, 110, 110], [391.0, 115, 115],
      [418.0, 120, 120], [446.0, 125, 125], [476.0, 130, 130], [507.0, 135, 135],
      [539.0, 140, 140], [573.0, 145, 145], [608.0, 150, 150], [645.0, 155, 155]
    ]
  },

  // R-22 — single-component (HCFC). Legacy equipment.
  "R-22": {
    glide: false, glideF: 0,
    note: "Single-component; a single saturation value is used.",
    points: [
      [10, -20, -20], [24, 0, 0], [33, 10, 10], [43, 20, 20], [55, 30, 30],
      [68.5, 40, 40], [76, 45, 45], [84, 50, 50], [92.6, 55, 55], [101.6, 60, 60],
      [111.2, 65, 65], [121.4, 70, 70], [132.2, 75, 75], [143.6, 80, 80],
      [155.7, 85, 85], [168.4, 90, 90], [181.8, 95, 95], [195.9, 100, 100],
      [210.8, 105, 105], [226.4, 110, 110], [242.7, 115, 115], [259.9, 120, 120],
      [277.9, 125, 125], [296.8, 130, 130], [316.6, 135, 135], [337.3, 140, 140]
    ]
  },

  // R-32 — single-component (A2L). Runs slightly higher pressure than R-410A.
  "R-32": {
    glide: false, glideF: 0,
    note: "Single-component; a single saturation value is used.",
    points: [
      [70, 14, 14], [76, 17.6, 17.6], [82, 21.2, 21.2], [89, 24.8, 24.8],
      [96, 28.4, 28.4], [103, 32, 32], [111, 35.6, 35.6], [119, 39.2, 39.2],
      [128, 42.8, 42.8], [136, 46.4, 46.4], [146, 50, 50], [156, 53.6, 53.6],
      [166, 57.2, 57.2], [176, 60.8, 60.8], [188, 64.4, 64.4], [199, 68, 68],
      [211, 71.6, 71.6], [224, 75.2, 75.2], [237, 78.8, 78.8], [251, 82.4, 82.4],
      [265, 86, 86], [280, 89.6, 89.6], [295, 93.2, 93.2], [311, 96.8, 96.8],
      [327, 100.4, 100.4], [345, 104, 104], [363, 107.6, 107.6], [381, 111.2, 111.2],
      [400, 114.8, 114.8], [420, 118.4, 118.4], [441, 122, 122], [462, 125.6, 125.6],
      [484, 129.2, 129.2], [507, 132.8, 132.8], [531, 136.4, 136.4], [556, 140, 140],
      [581, 143.6, 143.6], [607, 147.2, 147.2]
    ]
  },

  // R-454B — zeotropic blend (A2L), ~2°F glide. Bubble ≠ dew.
  "R-454B": {
    glide: true, glideF: 2,
    note: "Zeotropic blend (~2°F glide): suction uses dew, liquid uses bubble.",
    points: [
      [0, -59.0, -57.3], [20, -25.2, -23.3], [40, -4.6, -2.6], [60, 10.9, 13.0],
      [70, 17.4, 19.6], [80, 23.4, 25.6], [90, 29.0, 31.1], [100, 34.1, 36.3],
      [110, 38.9, 41.1], [120, 43.5, 45.7], [130, 47.7, 50.0], [140, 51.8, 54.1],
      [150, 55.7, 58.0], [160, 59.4, 61.7], [170, 63.0, 65.2], [180, 66.4, 68.6],
      [190, 69.6, 71.9], [200, 72.8, 75.1], [223, 80.0, 82.0], [241, 85.0, 87.0],
      [260, 90.0, 92.0], [280, 95.0, 97.0], [301, 100.0, 102.1], [320, 104.2, 106.3],
      [340, 108.5, 110.7], [360, 112.7, 114.8], [380, 116.7, 118.8], [400, 120.6, 122.6],
      [420, 124.3, 126.3], [440, 127.9, 129.9]
    ]
  }
};
