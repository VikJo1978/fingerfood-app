from __future__ import annotations

import runpy
from pathlib import Path

script = Path(__file__).with_name("issue171_apply_configurator_return.py")
text = script.read_text(encoding="utf-8")
old = '''replace_once(
    "frontend/src/utils/offerSnapshotRequest.ts",
    "  const current = normalizedFulfillment(charges);\\n  return {\\n",
    "  const current = normalizedFulfillment(charges);\\n  const returnLogistics =\\n    charges.returnLogistics ?? createInitialReturnLogisticsDefinition();\\n  return {\\n",
)
'''
new = '''replace_once(
    "frontend/src/utils/offerSnapshotRequest.ts",
    "export function buildChargesDefinition(\\n  charges: ChargesDefinition\\n): OfferSnapshotChargesDefinition {\\n  const current = normalizedFulfillment(charges);\\n  return {\\n",
    "export function buildChargesDefinition(\\n  charges: ChargesDefinition\\n): OfferSnapshotChargesDefinition {\\n  const current = normalizedFulfillment(charges);\\n  const returnLogistics =\\n    charges.returnLogistics ?? createInitialReturnLogisticsDefinition();\\n  return {\\n",
)
'''
if text.count(old) != 1:
    raise RuntimeError("expected exactly one offerSnapshotRequest anchor in patch script")
script.write_text(text.replace(old, new, 1), encoding="utf-8")
runpy.run_path(str(script), run_name="__main__")
