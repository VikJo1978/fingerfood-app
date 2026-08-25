from __future__ import annotations

import runpy
from pathlib import Path

script = Path(__file__).with_name("issue171_apply_configurator_return.py")
text = script.read_text(encoding="utf-8")

old_offer = '''replace_once(
    "frontend/src/utils/offerSnapshotRequest.ts",
    "  const current = normalizedFulfillment(charges);\\n  return {\\n",
    "  const current = normalizedFulfillment(charges);\\n  const returnLogistics =\\n    charges.returnLogistics ?? createInitialReturnLogisticsDefinition();\\n  return {\\n",
)
'''
new_offer = '''replace_once(
    "frontend/src/utils/offerSnapshotRequest.ts",
    "export function buildChargesDefinition(\\n  charges: ChargesDefinition\\n): OfferSnapshotChargesDefinition {\\n  const current = normalizedFulfillment(charges);\\n  return {\\n",
    "export function buildChargesDefinition(\\n  charges: ChargesDefinition\\n): OfferSnapshotChargesDefinition {\\n  const current = normalizedFulfillment(charges);\\n  const returnLogistics =\\n    charges.returnLogistics ?? createInitialReturnLogisticsDefinition();\\n  return {\\n",
)
'''
if text.count(old_offer) != 1:
    raise RuntimeError("expected one offerSnapshotRequest repair anchor")
text = text.replace(old_offer, new_offer, 1)

old_pricing = '''replace_once(
    "frontend/src/utils/pricing.ts",
    "    pauschalen.anlieferung +\\n    pauschalen.dishwareAdditional;\\n",
    "    pauschalen.anlieferung +\\n    pauschalen.dishwareAdditional +\\n    (pauschalen.returnPickup ?? 0);\\n",
)
'''
new_pricing = '''target = ROOT / "frontend/src/utils/pricing.ts"
pricing_text = target.read_text(encoding="utf-8")
pricing_old = "    pauschalen.anlieferung +\\n    pauschalen.dishwareAdditional;\\n"
pricing_new = "    pauschalen.anlieferung +\\n    pauschalen.dishwareAdditional +\\n    (pauschalen.returnPickup ?? 0);\\n"
if pricing_text.count(pricing_old) != 2:
    raise RuntimeError(
        f"frontend/src/utils/pricing.ts: expected two VAT/budget matches, found {pricing_text.count(pricing_old)}"
    )
target.write_text(pricing_text.replace(pricing_old, pricing_new), encoding="utf-8")
'''
if text.count(old_pricing) != 1:
    raise RuntimeError("expected one pricing repair anchor")
text = text.replace(old_pricing, new_pricing, 1)
script.write_text(text, encoding="utf-8")
runpy.run_path(str(script), run_name="__main__")
