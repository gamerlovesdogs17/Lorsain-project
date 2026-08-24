import type { MapMode } from "../map/TerenaMap.js";
import type { KernelWorld } from "@lorsain/sim";
import { partyColor, partyDisplayName } from "../presentation.js";

export function MapLegend(props: {
  mode: MapMode;
  world: KernelWorld;
  partyIds?: string[];
}) {
  if (props.mode === "political" || props.mode === "election") {
    const parties = props.partyIds ?? Object.keys(props.world.partyDefinitions).slice(0, 8);
    return (
      <div className="map-legend">
        <div className="kicker">Legend</div>
        <div className="legend-items">
          {parties.map((id) => (
            <span key={id} className="legend-item">
              <span className="swatch" style={{ background: partyColor(props.world, id) }} />
              {partyDisplayName(props.world, id)}
            </span>
          ))}
          <span className="legend-item">
            <span className="swatch" style={{ background: "#cfc9bd" }} />
            Vacant / other
          </span>
        </div>
        {props.mode === "election" ? (
          <p className="muted legend-note">
            Selected-election results or published geographic polls — never hidden voter support.
          </p>
        ) : null}
      </div>
    );
  }
  if (props.mode === "campaign") {
    return (
      <div className="map-legend">
        <div className="kicker">Legend</div>
        <div className="legend-gradient">
          <span>Ground Game 0</span>
          <span className="legend-bar campaign-org" />
          <span>Ground Game 100</span>
        </div>
        <p className="muted legend-note">Your provincial and constituency Ground Game strength.</p>
      </div>
    );
  }
  if (props.mode === "economy") {
    return (
      <div className="map-legend">
        <div className="kicker">Legend</div>
        <div className="legend-gradient">
          <span>Weaker</span>
          <span className="legend-bar economy-conditions" />
          <span>Stronger</span>
        </div>
        <p className="muted legend-note">Regional economic conditions; index reference = 100.</p>
      </div>
    );
  }
  return (
    <div className="map-legend">
      <div className="kicker">Legend</div>
      <p className="muted legend-note">Organization influence where publicly known.</p>
    </div>
  );
}
