import type { MapMode } from "../map/TerenaMap.js";
import type { KernelWorld } from "@lorsain/sim";
import { partyColor, partyDisplayName } from "../presentation.js";
import type { CampaignMapLayer } from "../map/publicLayers.js";

export function MapLegend(props: {
  mode: MapMode;
  world: KernelWorld;
  partyIds?: string[];
  campaignLayer?: CampaignMapLayer;
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
    if (props.campaignLayer && props.campaignLayer !== "ground_game") {
      const explanation = props.campaignLayer === "polling"
        ? "Color = leader in the latest direct public poll for that exact area. Gray = no direct local poll; a margin inside the poll's error remains neutral."
        : props.campaignLayer === "forecast"
          ? "Color = party favored by the public forecast. Direct local polls take priority; otherwise prior certified results or sitting representation produce a clearly labeled low-confidence lean."
          : "Color = party with the largest bloc or winning candidate in the previous comparable certified election. Gray = no legitimate comparable geographic result.";
      return (
        <div className="map-legend">
          <div className="kicker">{props.campaignLayer === "polling" ? "Published polling" : props.campaignLayer === "forecast" ? "Public forecast" : "Previous certified result"}</div>
          <div className="legend-items">
            {Object.keys(props.world.partyDefinitions).slice(0, 8).map((id) => <span key={id} className="legend-item"><span className="swatch" style={{ background: partyColor(props.world, id) }} />{partyDisplayName(props.world, id)}</span>)}
            <span className="legend-item"><span className="swatch no-data-swatch" />No data / too close</span>
          </div>
          <p className="muted legend-note">{explanation}</p>
        </div>
      );
    }
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
  return null;
}
