import { ImageResponse } from "next/og";
import { socialImageAlt } from "@/lib/social-metadata";

export const alt = socialImageAlt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#f4f7fa", color: "#122a35", padding: "64px 72px", borderTop: "12px solid #087f83" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 24, color: "#087f83" }}>
        <span>COMPANY INSIGHTS</span><span>companylens.ersione.com</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", flex: 1, justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 86, fontWeight: 700 }}>Company Lens</div>
          <div style={{ fontSize: 42, color: "#506776", marginTop: 22 }}>숫자로 보는 회사</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 160, marginLeft: 28 }}>
          {[72, 108, 136, 160].map((height, index) => <div key={height} style={{ width: 32, height, background: ["#b7dfdf", "#6cb9bd", "#2877b8", "#087f83"][index], borderRadius: "5px 5px 0 0" }} />)}
        </div>
      </div>
      <div style={{ display: "flex", borderTop: "1px solid #cfdae0", paddingTop: 26, justifyContent: "space-between", fontSize: 22, color: "#506776" }}>
        <span>Korea National Pension Service public data</span><span>Workplace-level estimates</span>
      </div>
    </div>,
    size
  );
}
