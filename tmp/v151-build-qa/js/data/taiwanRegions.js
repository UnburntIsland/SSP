/* ============================================================
   data/taiwanRegions.js  -  台灣區域地圖
   地圖節點只選擇既有 stageId，解鎖規則仍由關卡資料統一管理。
   ============================================================ */
(function (global) {
  global.GameData = global.GameData || {};

  global.GameData.taiwanMap = {
    version: 2,
    imagePath: "assets/images/maps/taiwan_overview/taiwan_region_map.webp?v=taiwan-map-20260730a",
    regions: [
      {
        id: "north",
        name: "北部",
        countyLabel: "新北市・淡水河口",
        stageId: "tidal_flat",
        stageTitle: "淡水河口淨流線",
        learningFocus: "河川垃圾如何一路進入海洋",
        mapNode: { xPercent: 32, yPercent: 18 }
      },
      {
        id: "central",
        name: "中部",
        countyLabel: "臺中市・高美與港區",
        stageId: "recycle_works",
        stageTitle: "臺中循環港區",
        learningFocus: "濕地、回收產業與棲地如何共存",
        mapNode: { xPercent: 30, yPercent: 44 }
      },
      {
        id: "south",
        name: "南部",
        countyLabel: "屏東縣・小琉球海岸",
        stageId: "blackwater_plant",
        stageTitle: "小琉球珊瑚守望",
        learningFocus: "海龜、珊瑚與海洋污染的關係",
        mapNode: { xPercent: 31, yPercent: 79 }
      },
      {
        id: "east",
        name: "東部",
        countyLabel: "花蓮縣・花東山海",
        stageId: "east_ridge",
        stageTitle: "花蓮山海溪谷",
        learningFocus: "山林、河川與海洋是相連的系統",
        mapNode: { xPercent: 70, yPercent: 54 }
      }
    ]
  };

  global.GameData.getTaiwanRegion = function (id) {
    return global.GameData.taiwanMap.regions.find(function (region) {
      return region.id === id;
    }) || null;
  };

  global.GameData.getTaiwanRegionForStage = function (stageId) {
    return global.GameData.taiwanMap.regions.find(function (region) {
      return region.stageId === stageId;
    }) || null;
  };
})(window);
