from pathlib import Path

path = Path("frontend/src/utils/__tests__/draftPersistence.test.ts")
text = path.read_text()
old = '''    expect(restored?.chargesDefinition).toEqual({
      ...draft.chargesDefinition,
      returnLogistics: {'''
new = '''    expect(restored?.chargesDefinition).toEqual({
      ...draft.chargesDefinition,
      delivery: {
        ...draft.chargesDefinition.delivery,
        fulfillment: createInitialOfferDraft().chargesDefinition.delivery.fulfillment,
      },
      returnLogistics: {'''
if old not in text:
    raise SystemExit("legacy chargesDefinition expectation not found")
path.write_text(text.replace(old, new, 1))
