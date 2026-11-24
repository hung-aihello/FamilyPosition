// Tạo file phím tắt "Nhà Mình" (app Phím tắt trên iPhone) dạng plist chưa ký.
// GitHub Actions (.github/workflows/shortcut.yml) ký nó bằng `shortcuts sign` trên máy Mac
// để iPhone mở được — xem README, mục "Phím tắt iPhone".
//
//   node shortcut/build.mjs <file-ra.plist>
//
// Phím tắt làm 4 việc:
//   0. Văn bản = mã kết nối (hỏi lúc thêm phím tắt: WFWorkflowImportQuestions)
//   1. Lấy vị trí hiện tại
//   2. Lấy mức pin
//   3. PATCH <mã>.json với JSON { lat, lng, battery, acc: 0, speed: 0, charging: false,
//      online: false, updatedAt: {".sv": "timestamp"} }
//      acc/speed = 0 để thẻ chi tiết không hiện sai số / "đang di chuyển" cũ còn sót từ lần mở app.
import fs from "node:fs";

const OBJ = "￼"; // ký tự giữ chỗ cho biến trong chuỗi của Phím tắt
const uuid = () => crypto.randomUUID().toUpperCase();

const T = uuid(), LOC = uuid(), BAT = uuid();

const text = (s) => ({ Value: { string: s, attachmentsByRange: {} }, WFSerializationType: "WFTextTokenString" });
const output = (uuid, name, aggr) => ({
  Type: "ActionOutput", OutputUUID: uuid, OutputName: name,
  ...(aggr ? { Aggrandizements: [{ Type: "WFPropertyVariableAggrandizement", PropertyName: aggr }] } : {}),
});
const varText = (v, suffix = "") => ({
  Value: { string: OBJ + suffix, attachmentsByRange: { "{0, 1}": v } },
  WFSerializationType: "WFTextTokenString",
});
const item = (key, type, value) => ({ WFItemType: type, WFKey: text(key), WFValue: value });
const ITEM = { text: 0, dict: 1, number: 3, bool: 4 };
const bool = (b) => ({ Value: b, WFSerializationType: "WFNumberSubstitutableState" });
const dict = (items) => ({ Value: { WFDictionaryFieldValueItems: items }, WFSerializationType: "WFDictionaryFieldValue" });

const actions = [
  { WFWorkflowActionIdentifier: "is.workflow.actions.gettext",
    WFWorkflowActionParameters: { UUID: T, WFTextActionText: "DÁN MÃ VÀO ĐÂY" } },
  { WFWorkflowActionIdentifier: "is.workflow.actions.getcurrentlocation",
    WFWorkflowActionParameters: { UUID: LOC } },
  { WFWorkflowActionIdentifier: "is.workflow.actions.getbatterylevel",
    WFWorkflowActionParameters: { UUID: BAT } },
  { WFWorkflowActionIdentifier: "is.workflow.actions.downloadurl",
    WFWorkflowActionParameters: {
      UUID: uuid(),
      WFURL: varText(output(T, "Văn bản"), ".json"),
      WFHTTPMethod: "PATCH",
      WFHTTPBodyType: "JSON",
      ShowHeaders: false,
      WFJSONValues: dict([
        item("lat", ITEM.number, varText(output(LOC, "Vị trí hiện tại", "Latitude"))),
        item("lng", ITEM.number, varText(output(LOC, "Vị trí hiện tại", "Longitude"))),
        item("battery", ITEM.number, varText(output(BAT, "Mức pin"))),
        item("acc", ITEM.number, text("0")),
        item("speed", ITEM.number, text("0")),
        item("charging", ITEM.bool, bool(false)),
        item("online", ITEM.bool, bool(false)),
        item("updatedAt", ITEM.dict, { Value: dict([item(".sv", ITEM.text, text("timestamp"))]), WFSerializationType: "WFDictionaryFieldValue" }),
      ]),
    } },
];

const shortcut = {
  WFWorkflowClientVersion: "2302.0.4",
  WFWorkflowMinimumClientVersion: 900,
  WFWorkflowMinimumClientVersionString: "900",
  WFWorkflowIcon: { WFWorkflowIconStartColor: 431817727, WFWorkflowIconGlyphNumber: 59446 }, // xanh lá, hình ngôi nhà
  WFWorkflowImportQuestions: [{
    ActionIndex: 0, Category: "Parameter", ParameterKey: "WFTextActionText", DefaultValue: "",
    Text: "Dán mã kết nối của bạn (Nhà Mình → ⚙️ Cài đặt → Gửi vị trí khi không mở app → Sao chép mã)",
  }],
  WFWorkflowActions: actions,
  WFWorkflowInputContentItemClasses: [],
  WFWorkflowOutputContentItemClasses: [],
  WFWorkflowTypes: [],
  WFQuickActionSurfaces: [],
  WFWorkflowHasShortcutInputVariables: false,
};

// ---- JS → plist XML ----
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function plist(v, ind = "") {
  const i2 = ind + "\t";
  if (typeof v === "boolean") return `${ind}<${v}/>`;
  if (typeof v === "number") return `${ind}<integer>${v}</integer>`;
  if (typeof v === "string") return `${ind}<string>${esc(v)}</string>`;
  if (Array.isArray(v)) return v.length ? `${ind}<array>\n${v.map((x) => plist(x, i2)).join("\n")}\n${ind}</array>` : `${ind}<array/>`;
  const keys = Object.keys(v);
  if (!keys.length) return `${ind}<dict/>`;
  return `${ind}<dict>\n${keys.map((k) => `${i2}<key>${esc(k)}</key>\n${plist(v[k], i2)}`).join("\n")}\n${ind}</dict>`;
}
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
${plist(shortcut)}
</plist>
`;
const out = process.argv[2];
if (out) fs.writeFileSync(out, xml); else process.stdout.write(xml);
