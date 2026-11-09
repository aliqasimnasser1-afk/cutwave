import { ImageResponse } from "next/og";

/** Full-bleed app icon (safe for maskable use) drawn at the given size. */
export function pwaIcon(size: number) {
  const u = size / 64; // the logo is designed on a 64-unit grid
  const bar = (x: number, y: number, h: number, opacity = 1) => (
    <div
      style={{
        position: "absolute",
        left: x * u,
        top: y * u,
        width: 4 * u,
        height: h * u,
        borderRadius: 2 * u,
        background: "#fff",
        opacity,
      }}
    />
  );
  // Scale the 64-unit artwork into the central 80% safe zone.
  const inner = 0.8;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #7c5cff 0%, #22d3ee 100%)",
        }}
      >
        <div
          style={{
            position: "relative",
            display: "flex",
            width: size,
            height: size,
            transform: `scale(${inner})`,
          }}
        >
          {bar(11, 27, 10, 0.55)}
          {bar(25, 19, 26)}
          {bar(32, 14, 36)}
          {bar(39, 22, 20)}
          {bar(49, 28, 8, 0.55)}
          <div
            style={{
              position: "absolute",
              left: 17.5 * u,
              top: 14.5 * u,
              width: 4.5 * u,
              height: 35 * u,
              borderLeft: `${3 * u}px solid #fff`,
              borderTop: `${3 * u}px solid #fff`,
              borderBottom: `${3 * u}px solid #fff`,
              borderRadius: `${1.5 * u}px 0 0 ${1.5 * u}px`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 46 * u,
              top: 14.5 * u,
              width: 4.5 * u,
              height: 35 * u,
              borderRight: `${3 * u}px solid #fff`,
              borderTop: `${3 * u}px solid #fff`,
              borderBottom: `${3 * u}px solid #fff`,
              borderRadius: `0 ${1.5 * u}px ${1.5 * u}px 0`,
            }}
          />
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
