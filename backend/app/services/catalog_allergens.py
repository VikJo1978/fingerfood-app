"""Map configurator allergen tokens to Core EU codes A–N."""

from __future__ import annotations

from app.models.classification import Allergen

_CONFIGURATOR_TO_EU: dict[str, str] = {
    Allergen.gluten.value: "A",
    Allergen.crustaceans.value: "B",
    Allergen.egg.value: "C",
    Allergen.fish.value: "D",
    Allergen.peanuts.value: "E",
    Allergen.soy.value: "F",
    Allergen.milk.value: "G",
    Allergen.nuts.value: "H",
    Allergen.celery.value: "I",
    Allergen.mustard.value: "J",
    Allergen.sesame.value: "K",
    Allergen.sulfites.value: "L",
    Allergen.lupin.value: "M",
    Allergen.molluscs.value: "N",
}


def eu_allergen_codes_from_configurator(allergens: list[Allergen]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for allergen in allergens:
        code = _CONFIGURATOR_TO_EU.get(allergen.value)
        if code is None or code in seen:
            continue
        seen.add(code)
        out.append(code)
    return sorted(out)


def eu_allergen_codes_from_strings(raw: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for item in raw:
        token = item.strip().upper()
        if len(token) == 1 and token in "ABCDEFGHIJKLMN":
            if token not in seen:
                seen.add(token)
                normalized.append(token)
            continue
        mapped = _CONFIGURATOR_TO_EU.get(item.strip().lower())
        if mapped and mapped not in seen:
            seen.add(mapped)
            normalized.append(mapped)
    return sorted(normalized)
