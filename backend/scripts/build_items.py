"""Builds app/data/items.json from the real Silberlöffel source menus:
  - Cateringangebot.pdf   (buffets by cuisine/occasion, individual fingerfood, soups)
  - Lunch_Buffets_2026.pdf (8 lunch buffets)
  - Mittagsmenue.pdf       (weekday lunch order form: M/D/S/B items)

Not a runtime app module — a one-time content-authoring script. Run with:
  cd backend && .venv/bin/python scripts/build_items.py

Every item gets allergens/ingredient_flags via scripts/derive_allergens.py
(literal keyword match only) and allergens_verified=False — see that module's
docstring and Item.allergens_verified for the safety rationale. Diet_type
reflects the primary/described preparation; "auch vegetarisch/vegan möglich"
style variants from the source text are kept in the description, not a
separate flag, matching how the source menus themselves express them (prose,
not structured data).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.derive_allergens import derive_allergens, derive_ingredient_flags  # noqa: E402
from scripts.derive_vat_rate import derive_vat_rate  # noqa: E402

ITEMS_JSON_PATH = Path(__file__).resolve().parents[1] / "app" / "data" / "items.json"


def buffet(
    id: str,
    name: str,
    section: str,
    category: str,
    price: float,
    *,
    min_order: int = 10,
    kalt: tuple[str, ...] = (),
    warm: tuple[str, ...] = (),
    dessert: tuple[str, ...] = (),
    note: str | None = None,
    diet_type: str = "omnivore",
    subcategory: str | None = None,
    price_type: str = "person",
    unit_label: str = "Person",
) -> dict:
    lines: list[str] = []
    if kalt:
        lines.append("Kalt:")
        lines.extend(f"- {d}" for d in kalt)
    if warm:
        if lines:
            lines.append("")
        lines.append("Warm:")
        lines.extend(f"- {d}" for d in warm)
    if dessert:
        if lines:
            lines.append("")
        lines.append("Dessert:")
        lines.extend(f"- {d}" for d in dessert)
    if note:
        if lines:
            lines.append("")
        lines.append(note)
    items_included = "\n".join(lines)
    derive_text = f"{name} {items_included}"
    return {
        "id": id,
        "name": name,
        "section": section,
        "category": category,
        "subcategory": subcategory,
        "price": price,
        "price_type": price_type,
        "min_order": min_order,
        "unit_label": unit_label,
        "description": f"{name} als Buffet/Paket, Paketpreis pro {'Person' if price_type == 'person' else unit_label}. Zusammensetzung siehe Details.",
        "items_included": items_included,
        "module": "food",
        "item_kind": "composite",
        "diet_type": diet_type,
        "ingredient_flags": derive_ingredient_flags(derive_text),
        "allergens": derive_allergens(derive_text),
        "allergens_verified": False,
        "vat_rate_percent": derive_vat_rate("food", "composite"),
    }


def piece(
    id: str,
    name: str,
    section: str,
    category: str,
    price: float,
    *,
    min_order: int = 10,
    unit_label: str = "Stück",
    description: str = "",
    diet_type: str = "omnivore",
    subcategory: str | None = None,
    item_kind: str = "simple",
    price_type: str = "piece",
    items_included: str | None = None,
    module: str = "food",
    surcharge_label: str | None = None,
    surcharge_amount: float | None = None,
) -> dict:
    derive_text = f"{name} {description} {items_included or ''}"
    return {
        "id": id,
        "name": name,
        "section": section,
        "category": category,
        "subcategory": subcategory,
        "price": price,
        "price_type": price_type,
        "min_order": min_order,
        "unit_label": unit_label,
        "description": description,
        "items_included": items_included,
        "module": module,
        "item_kind": item_kind,
        "diet_type": diet_type,
        "ingredient_flags": derive_ingredient_flags(derive_text),
        "allergens": derive_allergens(derive_text),
        "allergens_verified": False,
        "vat_rate_percent": derive_vat_rate(module, item_kind),
        "surcharge_label": surcharge_label,
        "surcharge_amount": surcharge_amount,
    }


items: list[dict] = []

# ============================================================
# Cateringangebot.pdf — BRÖTCHEN, SANDWICHES, BAGELS UND CO. (p.2-4)
# No explicit minimum order stated in this section of the source; honest
# default min_order=1 (do not invent "ab 10" where the source doesn't say so).
# ============================================================
items.append(piece(
    "broetchen-mix-1", "Brötchen Mix 1", "Brötchen, Sandwiches, Bagels", "Brötchen",
    2.30, min_order=1, unit_label="Stück",
    description="Kleine ganze Brötchen oder große halbe Brötchen (Auswahl von Vollkorn-, Mohn-, Sonnenblumen-, Kürbiskernbrötchen etc.), vegetarisch/vegan/Fleisch gemischt.",
    items_included=(
        "Avocadocreme mit getrockneter Tomate und gerösteten Mandeln – vegan –\n"
        "Kasslerbraten mit Früchte Deko\n"
        "Herzhafter Mozzarella mit Mandelpesto – vegetarisch –\n"
        "Mediterraner Frischkäse mit frischer Gurke – vegetarisch –\n"
        "Luftgetrocknete Salami mit Oliven\n"
        "Poulardenbrustfilet mit Champignon Creme und Kresse"
    ),
))
items.append(piece(
    "broetchen-mix-2", "Brötchen Mix 2", "Brötchen, Sandwiches, Bagels", "Brötchen",
    2.40, min_order=1, unit_label="Stück",
    description="Kleine ganze Brötchen oder große halbe Brötchen, vegetarisch/vegan/Fleisch gemischt.",
    items_included=(
        "Kichererbsen-Karottencreme mit Sprossen und Sonnenblumenkernen – vegan –\n"
        "Mittelalter Gouda mit Tafeltrauben – vegetarisch –\n"
        "Rosa gebratenes vom Rind an Cornichonfächer\n"
        "Putenbraten mit Champignon und Petersilie\n"
        "Weichkäse mit Melone und Physalis – vegetarisch –\n"
        "Luftgetrockneter Schinken gespießt mit Ananas"
    ),
))
items.append(piece(
    "broetchen-mix-3", "Brötchen Mix 3", "Brötchen, Sandwiches, Bagels", "Brötchen",
    2.60, min_order=1, unit_label="Stück",
    description="Kleine ganze Brötchen oder große halbe Brötchen, vegetarisch/vegan/Fleisch gemischt. + 1,00 € Aufpreis für Lachs oder Rind.",
    items_included=(
        "Humus-Chilicreme mit Tomatenwürfeln – vegan –\n"
        "Gereifter Höhlenkäse mit grünen Trauben – vegetarisch –\n"
        "Milde Salami aus dem Rauch\n"
        "Tomaten-Frischkäse mit Paprikawürfeln – vegetarisch –\n"
        "Rindersaftschinken mit Remoulade und Kirschtomate\n"
        "Räucherlachs mit feinem Meerrettich"
    ),
    surcharge_label="Lachs oder Rind", surcharge_amount=1.00,
))
items.append(piece(
    "sandwiches", "Sandwiches", "Brötchen, Sandwiches, Bagels", "Sandwiches",
    3.30, min_order=1, unit_label="Stück",
    description="Klassisch mit Weißbrot oder Vollkornbrot zubereitet. + 1,00 € pro Stück Aufpreis für Lachs oder Rind.",
    items_included=(
        "Französischer Schnittkäse mit einer Walnuss-Basilikum-Creme – vegetarisch –\n"
        "Mozzarellascheiben mit Strauchtomaten, Basilikum und Pesto – vegetarisch –\n"
        "Rosa gebratener Schweinerücken mit Curry-Krautsalat\n"
        "Putenbrustscheiben mit geröstetem Speck, Käse und Ananassalat\n"
        "Geräucherter Lachs mit einem Gurken-Dillsalat und Sahnemeerrettich"
    ),
    surcharge_label="Lachs oder Rind", surcharge_amount=1.00,
))
items.append(piece(
    "bagels", "Bagels", "Brötchen, Sandwiches, Bagels", "Bagels",
    3.45, min_order=1, unit_label="Stück",
    description="+ 1,00 € Aufpreis für Lachs oder Rind.",
    items_included=(
        "Mediterrane Frischkäsecreme mit Tomatenwürfeln, Oliven und Gartenkresse – vegetarisch –\n"
        "Mozzarella mit Basilikumpesto und Tomaten-Kräutersalat – vegetarisch –\n"
        "Thunfischsalat mit Paprika, Kapern und Blattpetersilie\n"
        "Roastbeef mit Gemüsegurke und Remoladensauce\n"
        "Gegrillte Hähnchenbrust, Lauchzwiebeln und marinierten Zucchini"
    ),
    surcharge_label="Lachs oder Rind", surcharge_amount=1.00,
))
items.append(piece(
    "vollkorncanapees-1", "Vollkorncanapées – Variante I", "Brötchen, Sandwiches, Bagels", "Canapées",
    13.00, min_order=1, unit_label="Person", price_type="person",
    description="Pro Person 5 Stück hochwertig belegt.",
    items_included=(
        "Camembert mit Traubensalat und Feige – vegetarisch –\n"
        "Paprika-Basilikumcreme und Parmesansplittern – vegetarisch –\n"
        "Büffelmozzarella, Basilikumpesto und Roma-Tomaten – vegetarisch –\n"
        "Edelschimmelkäse mit Walnusssauce, Minze und Melonenfilets – vegetarisch –"
    ),
    diet_type="vegetarian", item_kind="composite",
))
items.append(piece(
    "vollkorncanapees-2", "Vollkorncanapées – Variante II", "Brötchen, Sandwiches, Bagels", "Canapées",
    14.90, min_order=1, unit_label="Person", price_type="person",
    description="Pro Person 5 Stück hochwertig belegt.",
    items_included=(
        "Gebeizter Lachs auf Kräuterrührei mit Honig-Senf-Sauce\n"
        "Rosa gebratenes Roastbeef mit marinierten Champignons\n"
        "Edelschimmelkäse mit Kerbelcreme und zweierlei Trauben – vegetarisch –\n"
        "Luftgetrockneter Schinken auf kleinen Melonenschiffchen\n"
        "Tranchen von der Barbarie-Entenbrust mit Trüffel-Olivencreme"
    ),
    item_kind="composite",
))
items.append(piece(
    "wraps", "Wraps", "Brötchen, Sandwiches, Bagels", "Wraps",
    4.50, min_order=1, unit_label="Person", price_type="person",
    items_included=(
        "Kräutersalat mit Gemüsewürfeln, Creme Fraîche, Gurken und getrockneten Tomaten – vegetarisch –\n"
        "Emmentaler mit Radieschen, Sprossen und Ei in einer leichten Kressemayonnaise – vegetarisch –\n"
        "Putenbruststreifen in einer Ananas-Currysauce mit süßem Chili-Confit\n"
        "Streifen vom Schweinerücken mit einem Orangen-Sellerie-Salat und gehackten Nüssen"
    ),
    item_kind="composite",
))

# ---- Business Variationen für Ihr Meeting (p.4-5) — "Lieferbar ab 10 Personen" ----
items.append(piece(
    "business-hanseatisch", "Business Variation Hanseatisch", "Brötchen, Sandwiches, Bagels", "Business Meeting",
    12.60, min_order=10, unit_label="Person", price_type="person",
    items_included=(
        "Gemüsesticks mit hausgemachtem Kräutersauerrahm – vegetarisch –\n"
        "Salat von Matjes, roter Beete, Zwiebeln und Gewürzgurke\n"
        "Vollkorncanapée mit rosa gebratenem Schweinerücken und hausgemachter Remoulade belegt\n"
        "Backpflaumen im Speckmantel\n"
        "Hackbällchen unter einer Kerbel-Senf-Haube"
    ),
    item_kind="composite",
))
items.append(piece(
    "business-mediterran", "Business Variation Mediterran", "Brötchen, Sandwiches, Bagels", "Business Meeting",
    13.90, min_order=10, unit_label="Person", price_type="person",
    items_included=(
        "Tomate-Mozzarella-Spieß mit Basilikum – vegetarisch –\n"
        "Hausgebackener Gemüsekuchen mit Creme Fraîche und gebratenen Pilzen – vegetarisch –\n"
        "Spieße von mariniertem Schafskäse, Gurke und Oliven – vegetarisch –\n"
        "Levantinischer Wrap gefüllt mit gebratener Aubergine und Putenbruststreifen\n"
        "Melonenschiffchen mit luftgetrocknetem Schinken"
    ),
    item_kind="composite",
))
items.append(piece(
    "business-vital", "Business Variation Vital", "Brötchen, Sandwiches, Bagels", "Business Meeting",
    12.90, min_order=10, unit_label="Person", price_type="person",
    items_included=(
        "Kleine Crêpes-Röllchen gefüllt mit Blattspinat, Tomaten und Kräuterpesto – vegetarisch –\n"
        "Kleine Vollkornbrötchen im Ganzen, belegt mit Räucherlachs in Honig-Senf-Sauce, Salat und Sprossen\n"
        "Salat von Cous-Cous, Hähnchenbruststreifen und Rucola in einer Kressecreme – im Miniglas angerichtet –\n"
        "Mundgerecht geschnittene Obstvariationen"
    ),
    item_kind="composite",
))
items.append(piece(
    "business-asia", "Business Variation Asia", "Brötchen, Sandwiches, Bagels", "Business Meeting",
    11.40, min_order=10, unit_label="Person", price_type="person",
    items_included=(
        "Vegetarischer Glasnudelsalat mit Koriander, kleinen Tomaten, geröstetem Sesam in einer Limonen-Palmzucker-Marinade – im Miniglas angerichtet –\n"
        "Spieße von Schweinefilet, Pak Choi und Mango\n"
        "Chili-Frikadellen\n"
        "Tropische Früchte auf Holz gespießt"
    ),
    item_kind="composite",
))

# ============================================================
# FINGERFOOD-BÜFFETS (p.5-8) — "Lieferbar ab 10 Personen"
# ============================================================
items.append(buffet(
    "fingerfood-buffet-1", "Fingerfood I", "Fingerfood-Büffets", "Fingerfood-Büffet", 19.90, min_order=10,
    kalt=(
        "Gemüsesticks von Gurke, Karotte, Paprika und Radieschen, dazu ein Schnittlauchdip – vegetarisch –",
        "Kleine Frühlingsrolle, vegetarisch gefüllt, dazu ein süß-scharfer Chilidip",
        "Canapée belegt mit: Paprika-Basilikumcreme und Parmesansplittern – vegetarisch – / geräuchertem Lachs mit Ruccola-Meerrettichcreme",
        "Minibrötchen mit hauchdünn geschnittener Hähnchenbrust und Champignonsalat",
        "Melonenschiffchen mit luftgetrocknetem Schinken",
        "Spieß von der Poulardenbrust im Kokosmantel",
        "Hausgebackenes Brot im Korb",
    ),
    dessert=("Spieß von tropischen Früchten mit Schokolade überzogen (8 Teile)",),
))
items.append(buffet(
    "fingerfood-buffet-2", "Fingerfood II", "Fingerfood-Büffets", "Fingerfood-Büffet", 26.50, min_order=10,
    kalt=(
        "Kleiner vegetarischer Spinatkuchen mit Creme Fraîche und Champignons – vegetarisch –",
        "Zucchinischiffchen mit Gemüsetartar und Kräutermousse gratiniert – vegetarisch –",
        "Mini-Sandwich mit Mozzarella, Tomaten, Basilikum und Pesto – vegetarisch –",
        "Gegrilltes Gemüse der Saison mit Balsamico und Olivenöl mariniert und auf Holz gespießt – vegetarisch –",
        "Kartoffelrösti mit einem Tatar vom Matjes, Äpfeln und roten Zwiebeln",
        "Pflaume im Speckmantel gebacken",
        "Hähnchenspieß mit Ananas und Chili",
        "Mini-Wrap mit Putenbruststreifen in einer Ananas-Currysauce",
        "Kleines Laugengebäck mit Sour Cream – vegetarisch –",
        "Hausgebackenes Brot im Korb",
    ),
    dessert=("Fruchtsalat mit einer Mandelmousse-Haube – im Miniglas angerichtet – (10 Teile)",),
))
items.append(buffet(
    "fingerfood-buffet-3", "Fingerfood III", "Fingerfood-Büffets", "Fingerfood-Büffet", 26.00, min_order=10,
    kalt=(
        "Melonenschiffchen mit Parmaschinken umhüllt",
        "Kleiner Salat vom Tropenbarsch, Flusskrebsen, Ananas, Sprossen und Limone – im Mini-Glas angerichtet –",
        "Kleine Heidekartoffeln mit einem Räucherlachs-Spargelragout gefüllt",
        "Röllchen vom rosa Roastbeef mit Avocadospalten und etwas Chili gefüllt",
        "Scampispieße mit süßem Basilikum auf roter Kräuter-Aioli",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Saté von der Poulardenbrust im Erdnuss-Kokosmantel",
        "Sommerliches Gemüse, knackig gebraten und mit Kräutern, Olivenöl und Balsamico mariniert – auf Holz gespießt – vegetarisch –",
    ),
    dessert=("Medaillons von tropischen Früchten unter einer Haube von weißem Mandelmousse – im Mini-Glas angerichtet – (8 Teile)",),
))
items.append(buffet(
    "fingerfood-buffet-4", "Fingerfood IV", "Fingerfood-Büffets", "Fingerfood-Büffet", 28.80, min_order=10,
    kalt=(
        "Garnelenspieß 'Szilia'",
        "Wiesenchampignons mit Frischkäse gefüllt – vegetarisch –",
        "Yakitori-Chicken-Spieß",
        "Auberginen-Röllchen vom Spieß mit Kokosraspeln – vegetarisch –",
        "Frische Gemüseröschen auf der Gabel – vegetarisch –",
        "Safranrisotto mit Garnelen – auf dem Löffel garniert –",
        "Asia Dim Sum Variationen, 2 verschiedene Sorten",
        "Mini-Frühlingsrollen – vegetarisch –",
        "Schweinefilet und marinierter Kürbis mit Rosmarin gespießt",
        "Tomate-Mozzarella-Spieß mit Pesto – vegetarisch –",
        "Mini-Erdäpfel gefüllt mit buntem Tatar von norwegischem Räucherlachs",
        "Hausgebackenes Brot im Korb (11 Teile)",
    ),
))
items.append(buffet(
    "fingerfood-buffet-5", "Fingerfood V", "Fingerfood-Büffets", "Fingerfood-Büffet", 28.90, min_order=10,
    kalt=(
        "Champignons mit einem Gemüseragout gefüllt und mit Käse gratiniert – vegetarisch –",
        "Weizenteigröllchen mit einem Tomate-Mozzarellasalat und Basilikumcreme gefüllt – vegetarisch –",
        "Kleine Backkartoffel mit einem Pilzsalat und Sauerrahm gefüllt – vegetarisch –",
        "Zucchiniroulade mit Rucola und Käse gefüllt – vegetarisch –",
        "Auberginenpizza mit Tomatenragout und Thymian – vegetarisch –",
        "Mini-Zwiebelkuchen mit geröstetem Speck und Creme Fraîche",
        "Lachspraline auf Meerrettichschaum mit gegrilltem Lauch gespießt",
        "Kleines Medaillon von der Putenbrust mit einer Chilimarinade",
        "Röllchen vom Schweinerücken mit einem Thunfisch-Kapernmousse gefüllt",
        "Chicoréeschiffchen mit einer Kräuterkäsecreme gefüllt und mit Streifen von getrocknetem Schinken belegt",
        "Hausgebackenes Brot im Korb",
    ),
    dessert=("Hamburger Kirschtorte mit Bisquit, Weinbrand und Schokolade – im Mini-Glas angerichtet – (11 Teile)",),
))
items.append(buffet(
    "fingerfood-pyramide", "Fingerfood auf der Pyramide", "Fingerfood-Büffets", "Fingerfood-Büffet", 37.80, min_order=10,
    kalt=(
        "Tartar von zweierlei Lachs mit Dill und Kaviar",
        "Rosa Tranchen von der Entenbrust auf Mangochutney",
        "Gegrillte Scampi auf einem Duftreis-Kräuterbett",
        "Kleine Schweinefiletmedaillons auf einem Papaya-Chili-Salat",
        "Poulardenbruststreifen vom Grill auf einem Mangoldragout",
        "Salat von Waldpilzen und Kirschtomaten mit Balsamico und Kräutern – vegetarisch –",
        "Saté von Red Snapper im Mantel aus geröstetem Kokos",
        "Kleine Röllchen vom Schweinefilet mit Blattspinat und getrockneten Tomaten gefüllt",
        "Kleine Lasagne von Reibekuchen, Rinderfilet und zweierlei Kräutermousse",
        "Zucchinischiffchen mit einem Pilzragout und geschmolzenem Mozzarella gefüllt – vegetarisch –",
        "Hausgebackenes Brot im Korb",
    ),
    dessert=(
        "Verschiedene Zitrusfrüchte gefüllt mit einer Creme von Vanille und roten Beeren",
        "Schwarzwälder Kirschtorte – im Mini-Glas angerichtet –",
        "Edle Käsesorten, als Sticks, mit Früchten serviert (13 Teile)",
    ),
))
items.append(buffet(
    "fingerfood-de-luxe", "Fingerfood De Luxe", "Fingerfood-Büffets", "Fingerfood-Büffet", 39.90, min_order=10,
    kalt=(
        "Mini-Canapées von rosa gebratener Entenbrust mit Honigkruste",
        "Seawater-Scampi im Rucolablatt, auf einem mit Frischkäse gefüllten Gurkenschiffchen",
        "Kleine Auberginenpizza mit Pinienkernen, Creme Fraîche und Basilikum – vegetarisch –",
        "Bruschetta mit Würfeln vom Parmaschinken, Tomaten, Zwiebeln und toskanischen Kräutern",
        "Spieß von Austernpilzen, Champignons und getrockneten Tomaten – vegetarisch –",
        "Kleiner Saté von der Barbarie-Entenbrust mit einer Johannisbeer-Orangensauce",
        "Gegrillter Scampi in Palmzucker und Koriander mariniert",
        "Flusskrebstatar mit Carambole, Creme Fraîche und Minze – auf dem Löffel serviert –",
        "Schweinefiletmedaillon, rosa gebraten, mit Rucola, Kirschtomaten und Parmesansplittern",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Medaillon vom Seeteufel im Sesam-Zucchinimantel",
        "Mini-Saltimbocca vom Schweinefilet mit Parmaschinken, Tomaten und Salbei",
        "Marinierte Antipasti am Spieß – vegetarisch –",
    ),
    dessert=("Zweierlei Mousse au Chocolat mit Beerenpüree – im Mini-Glas serviert – (13 Teile)",),
))

# ============================================================
# EMPFANGSBÜFFETS (p.8-10) — "Lieferung ab 10 Personen (10 Stück pro Sorte)"
# ============================================================
items.append(buffet(
    "empfangsbuffet-1", "Empfangsbüffet I", "Empfangsbüffets", "Empfangsbüffet", 16.90, min_order=10,
    kalt=(
        "Party-Frikadelle",
        "Curry-Kokos-Chicken",
        "Croustini mit Tomatenconfit und Basilikum-Pesto – vegetarisch –",
        "Chicken Fingers BBQ",
        "Tomate-Mozzarella-Spieß – vegetarisch –",
        "Mini-Pizza verschieden belegt",
        "Zucchini-Ruccola-Röllchen – vegetarisch –",
        "Cantaloupe-Melone mit Schinken",
        "Hausgebackenes Brot im Korb (8 Teile)",
    ),
))
items.append(buffet(
    "empfangsbuffet-2", "Empfangsbüffet II", "Empfangsbüffets", "Empfangsbüffet", 21.50, min_order=10,
    kalt=(
        "Yakitori-Spieß pikant mariniert",
        "Frische Ananas im Speckmantel gebacken",
        "Roulade vom Crêpe mit Frischkäse und Räucherlachs gefüllt",
        "Lachsfilet auf einem Bett von Blattspinat gegart – auf dem Löffel serviert –",
        "Asia Teigsäckchen, vegetarisch gefüllt",
        "Chicken-Bambussticks",
        "Feigentaler mit Frischkäsehaube – vegetarisch –",
        "Polenta-Häppchen mit Mozzarella und Pesto – vegetarisch –",
        "Samosataschen mit pikanter Füllung",
        "Tomate-Mozzarella-Spieß mit Basilikum-Pesto – vegetarisch –",
        "Hausgebackenes Brot im Korb (10 Teile)",
    ),
))
items.append(buffet(
    "empfangsbuffet-3", "Empfangsbüffet III", "Empfangsbüffets", "Empfangsbüffet", 27.00, min_order=10,
    kalt=(
        "Melonenschiffchen mit Parmaschinken umhüllt",
        "Kleiner Salat von Tropenbarsch, Flusskrebsen, Ananas, Sprossen und Limone – im Mini-Glas angerichtet –",
        "Kleine Heide-Kartoffeln mit einem Räucherlachs-Spargelragout gefüllt",
        "Röllchen vom rosa gebratenen Roastbeef mit Avocadospalten und etwas Chili gefüllt",
        "Scampispieße mit süßem Basilikum auf roter Kräuter-Aioli",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Saté von der Poulardenbrust im Erdnuss-Kokosmantel",
        "Sommerliches Gemüse, knackig gebraten und mit Kräutern, Olivenöl, Balsamico mariniert – auf Holz gespießt – vegetarisch –",
        "Medaillons vom Lachs in Pesto gebraten und mit Zucchini umhüllt",
    ),
    dessert=("Salat von tropischen Früchten unter einer Haube von weißem Mandelmousse – im Mini-Glas angerichtet – (9 Teile)",),
))
items.append(buffet(
    "empfangsbuffet-4", "Empfangsbüffet IV", "Empfangsbüffets", "Empfangsbüffet", 27.00, min_order=10,
    kalt=(
        "Garnelenspieß 'Szilia'",
        "Wiesenchampignons mit Frischkäse gefüllt – vegetarisch –",
        "Yakitori-Chicken-Spieß",
        "Curry-Chicken-Spieß mit Kokosraspeln",
        "Auberginen-Röllchen vom Spieß mit Kokosraspeln – vegetarisch –",
        "Frische Gemüseröschen auf der Gabel – vegetarisch –",
        "Safranrisotto mit Garnelen – auf dem Löffel garniert –",
        "Asia Dim Sum Variationen, 2 verschiedene Sorten",
        "Mini-Frühlingsrollen – vegetarisch –",
        "Schweinefilet und marinierter Kürbis mit Rosmarin gespießt",
        "Tomate-Mozzarella-Spieß mit Pesto – vegetarisch –",
        "Mini-Erdäpfel gefüllt mit buntem Tatar von norwegischem Räucherlachs",
        "Hausgebackenes Brot im Korb (12 Teile)",
    ),
))

# ============================================================
# FINGERFOOD EINZELTEILE (p.10-14) — "ab 10 Stück pro Sorte"
# ============================================================
_ff_min = 10
def ff(id_, name, price, diet=None):
    d = "vegetarian" if diet == "veg" else ("vegan" if diet == "vegan" else "omnivore")
    return piece(id_, name, "Fingerfood Einzelteile", "Fingerfood", price, min_order=_ff_min, unit_label="Stück", diet_type=d)

items.append(ff("ff-party-frikadelle", "Party-Frikadelle", 1.40))
items.append(ff("ff-mini-pizza", "Mini-Pizza verschieden belegt", 1.45))
items.append(ff("ff-datteln-speck", "Datteln im Speckmantel gebacken", 1.85))
items.append(ff("ff-pflaumen-speck", "Pflaumen im Speckmantel gebacken", 1.85))
items.append(ff("ff-hackbaellchen-cherry", "Hackbällchen mit Cherrytomaten", 1.60))
items.append(ff("ff-cantaloupe-schinken", "Cantaloupe-Melone mit luftgetrocknetem Schinken", 2.50))
items.append(ff("ff-mini-tortilla-tacobeef", "Mini-Tortilla-Rolle gefüllt mit Tacobeef und Tomaten-Salsa", 3.50))
items.append(ff("ff-tropenbarsch-spiess", "Spieß vom Tropen-Barsch mit Ananas und Kokos", 3.00))
items.append(ff("ff-wrap-rind-paprika", "Mini-Wrap gefüllt mit Tomaten, Zwiebeln, Gemüsepaprika und Rinderhackfleisch", 3.40))
items.append(ff("ff-wrap-lachs-dill", "Mini-Wrap gefüllt mit Lachs, Salat und Dill-Dip", 3.40))
items.append(ff("ff-wrap-falafel-vegan", "Mini-Wrap gefüllt mit leicht scharfer Avocadocreme, Rucola und gerösteten Falafelwürfeln", 3.40, diet="vegan"))
items.append(ff("ff-wrap-putenbrust", "Mini-Wrap gefüllt mit Putenbrust, Kräutermarinade und Salat", 3.40))

items.append(ff("ff-fruehlingsrolle-veg", "Mini-Frühlingsrolle vegetarisch mit Weißkohl, Möhren, Porree, Bambus und Zwiebeln", 1.40, diet="veg"))
items.append(ff("ff-shrimps-wan-tan", "Shrimps-Sesam-Wan Tan: Shrimps, Surimi und Kräuter, eingeschlagen im Sesamteig", 1.80))
items.append(ff("ff-asia-teigsaeckchen-fisch", "Asia Teigsäckchen mit pikantem Fisch gefüllt", 1.65))
items.append(ff("ff-yakitori-spiess", "Yakitori-Spieß, asiatischer Geflügelspieß", 2.20))
items.append(ff("ff-samosatasche-veg", "Samosatasche, asiatisches Teigtäschchen mit vegetarischer Füllung", 1.80, diet="veg"))
items.append(ff("ff-tandoori-lachs", "Tandoori-Lachswürfel mit Sambal Olek", 2.20))
items.append(ff("ff-lachspraline-sesam", "Lachspraline im Sesammantel", 2.30))
items.append(ff("ff-shandong-shrimps", "Shandong Shrimps Roll: Black Tiger Garnele mit Glasnudeln und Bambus im Knusperteig", 2.50))
items.append(ff("ff-reisplaetzchen-scampi", "Rotes Reisplätzchen mit einem Scampi und Limone garniert", 3.00))
items.append(ff("ff-maxi-sate-huhn", "Maxi-Saté von der Hähnchenbrust mit Kokos-Erdnuss-Sauce überzogen", 4.50))
items.append(ff("ff-garnelenspiess-jamjam", "Garnelenspieß Jam Jam, Riesengarnele mit getrockneten Tomaten, pikant mariniert", 4.50))

items.append(ff("ff-haehnchentaler-cornflakes", "Hähnchentaler im Cornflakes-Mantel", 1.70))
items.append(ff("ff-chicken-fingers-bbq", "Chicken Fingers BBQ, Hähncheninnenfilet mit BBQ-Würzung", 2.00))
items.append(ff("ff-curry-kokos-chicken", "Curry-Kokos-Chicken, marinierte Hähnchenbrust 'spicy'", 2.20))
items.append(ff("ff-chicken-pineapple-stick", "Chicken-Pineapple-Stick, marinierte Hähnchenbruststücke mit Ananas-Würfeln", 2.30))

items.append(ff("ff-zucchini-rucola-roellchen", "Zucchini-Rucola-Röllchen mit Käse gefüllt und im Ofen überbacken", 2.50, diet="veg"))
items.append(ff("ff-auberginen-roellchen-grill", "Auberginen-Röllchen vom Grill mit Käse gefüllt", 2.50, diet="veg"))
items.append(ff("ff-tomate-mozzarella-spiess", "Tomate-Mozzarella-Spieß mit Basilikum", 2.50, diet="veg"))
items.append(ff("ff-polenta-haeppchen", "Polenta-Häppchen mit Mozzarella und Pesto", 1.80, diet="veg"))
items.append(ff("ff-croustini-tomatenconfit", "Croustini mit Tomatenconfit und Basilikum", 1.90, diet="veg"))
items.append(ff("ff-wiesenchampignon-frischkaese", "Wiesenchampignon mit Frischkäse gefüllt", 2.50, diet="veg"))
items.append(ff("ff-gemuesetatar-kartoffelroesti", "Gemüsetatar mit Gartenkräutern auf Kartoffelrösti", 2.50, diet="veg"))
items.append(ff("ff-fetakaese-spiess", "Spieß vom original griechischen Fetakäse mit Gurken und Oliven", 3.00, diet="veg"))
items.append(ff("ff-gemuesespiess-antipasti", "Marinierter Gemüsespieß à la Antipasti", 2.10, diet="veg"))
items.append(ff("ff-gemuesesticks-sourcream", "Frische Gemüsesticks der Saison mit Sour Cream (pro Pers. 8 Stück)", 2.20, diet="veg"))
items.append(ff("ff-feigentaler-ziegenkaese", "Feigentaler mit Honigfrischkäsehaube und Ziegenkäse", 2.60, diet="veg"))

items.append(ff("ff-kartoffelpizza-haehnchen", "Kleine Kartoffelpizza mit Hähnchenbrust und Salbei", 2.50))
items.append(ff("ff-kartoffelpizza-spinat", "Kleine Kartoffelpizza mit Blattspinat, Tomaten und Creme Fraîche", 2.50, diet="veg"))
items.append(ff("ff-quiche-appenzeller", "Hausgemachte Quiche vom Blech mit Appenzeller und Tiroler Speckwürfeln", 2.40))
items.append(ff("ff-quiche-spinat-oliven", "Hausgemachte Quiche vom Blech mit Blattspinat, Oliven und getrockneten Tomaten", 2.40, diet="veg"))
items.append(ff("ff-mini-reibekuchen-lachs", "Mini-Reibekuchen mit Creme Fraîche und Räucherlachs", 3.00))
items.append(ff("ff-mini-erdaepfel-matjes", "Mini-Erdäpfel gefüllt mit Sylter Matjestatar oder norwegischem Räucherlachs", 3.00))
items.append(ff("ff-roulade-zucchini-lachs", "Roulade von Zucchini und Räucherlachs mit Meerrettichcreme und Dillspitzen", 3.00))
items.append(ff("ff-laugengebaeck-kraeuterschaum", "Mini-Laugengebäck mit Kräuterschaum, Tomatenconcassée und gebackenem Basilikum", 2.70, diet="veg"))
items.append(ff("ff-laugengebaeck-kapernpesto", "Mini-Laugengebäck mit Kapernpesto oder Tomaten-Dip", 2.70, diet="veg"))
items.append(ff("ff-champignons-raeucherlachstatar", "Gegrillte Wiesenchampignons mit Räucherlachstatar und Creme Fraîche", 3.00))
items.append(ff("ff-auberginenpizza-parmaschinken", "Mini-Auberginenpizza mit einem Ragout von Parmaschinken und getrockneten Tomaten gefüllt", 2.50))
items.append(ff("ff-roastbeef-pesto-champignons", "Röllchen vom rosa Roastbeef mit Pesto, auf gebratenen Champignons", 3.00))
items.append(ff("ff-safran-meeresfruechte-risotto", "Safran-Meeresfrüchte-Risotto – auf einem Löffel angerichtet –", 2.65))
items.append(ff("ff-garnelen-mango-papaya", "Marinierte Garnelen mit Mango-Papaya-Salsa", 2.75))
items.append(ff("ff-lachsfilet-mangoldragout", "Gedämpftes Lachsfilet auf Mangoldragout – auf einem Löffel angerichtet –", 3.05))
items.append(ff("ff-schweinefilet-sesam-pflaume", "Medaillon von Schweinefilet im Sesammantel mit Pflaumensauce", 3.15))
items.append(ff("ff-schweinefilet-speck-pflaume", "Spieß vom Schweinefilet mit Speck und Pflaume", 3.80))
items.append(ff("ff-scampispiess-orange-ingwer", "Großer Scampispieß vom Grill mit Orangen-Ingwer Marinade", 4.50))
items.append(ff("ff-rinderfilet-medaillon-rucola", "Rosa gebratenes Mini-Rinderfilet-Medaillon mit Rucola, Kirschtomaten, Parmesansplitter", 5.45))

items.append(ff("ff-lachspraline-kraeuterschaum", "Lachspraline aus dem Ofen mit grünem Kräuterschaum", 2.30))
items.append(ff("ff-curry-pute-banane", "Curry von der Pute und Banane mit rosa Pfeffer", 2.60))
items.append(ff("ff-linsensalat-koriander", "Salat von zweierlei Linsen mit Koriander, gerösteten Nüssen, Eiern und Himbeeressig", 2.20, diet="veg"))
items.append(ff("ff-kirschtomaten-mozzarella-salat", "Kleiner Salat von Kirschtomaten, Mozzarella und Basilikum, mit altem Balsamico", 3.00, diet="veg"))
items.append(ff("ff-austernpilze-salbei-speck", "Ragout von gebratenen Austernpilzen mit Salbei und gerösteten Speckwürfeln", 2.40))
items.append(ff("ff-matjestatar-kaviar", "Matjestatar mit rosa Kaviar und Creme Fraîche", 2.50))
items.append(ff("ff-shrimps-avocadosalat", "Marinierte Shrimps auf Avocadosalat", 2.50))
items.append(ff("ff-flusskrebstatar-carambole", "Flusskrebstatar mit Carambole, Creme Fraîche und Minze", 3.00))
items.append(ff("ff-lachs-feldsalat-dill", "Rose vom Lachs im Feldsalatbett mit Dillcremehaube", 2.80))
items.append(ff("ff-entenbrust-paprika-duftreis", "Geröstete Entenbrust mit gelber Paprika und Duftreis", 2.75))
items.append(ff("ff-rinderfilet-mango-kokoscurry", "Gegrillte Rinderfiletscheiben auf Mango-Kokoscurry mit Thai-Basilikum", 4.00))
items.append(ff("ff-scampi-rote-linsen", "Gebratener Scampi auf Salat von roten Linsen", 3.00))
items.append(ff("ff-scampi-safranrisotto", "Scampi vom Grill auf Mailänder Safranrisotto", 3.50))

items.append(ff("ff-ananas-parmaschinken-gefuellt", "Gebackene Ananas in Parmaschinken gehüllt", 3.00))
items.append(ff("ff-scampi-palmzucker-koriander", "Gegrillter Scampi in Palmzucker und Koriander mariniert", 2.50))
items.append(ff("ff-mini-saltimbocca-marsala", "Mini-Saltimbocca vom Schweinefilet mit Schinken und Salbei gefüllt, mariniert in Marsala", 3.00))
items.append(ff("ff-riesengarnele-schinkenmantel", "Riesengarnele im Schinkenmantel gegart", 3.00))
items.append(ff("ff-rinderfilet-praline-mango", "Praline vom Rinderfilet in einem Mangomantel", 6.00))

items.append(ff("ff-salat-schafskaese-miniglas", "Schafkäsesalat mit Gurken, Oliven und Peperoni in einer Thymian-Zitronenvinaigrette – im Miniglas –", 3.40, diet="veg"))
items.append(ff("ff-salat-couscous-miniglas", "Cous Cous Salat mit gegrillter Paprika, Zucchini, Champignons und Hähnchenbruststreifen mit geröstetem Sesam und Honig – im Miniglas –", 3.40))
items.append(ff("ff-salat-kartoffel-mediterran-miniglas", "Mediterraner Kartoffelsalat mit Rucola, kleinen Tomaten, Parmaschinken und Parmesan, mit weißem Balsamico und Olivenöl mariniert – im Miniglas –", 3.40))
items.append(ff("ff-salat-putenbrust-curry-miniglas", "Salat von geräucherter Putenbrust, geraspeltem Weißkraut, Orangenfilets und Pinienkernen in einer Curry-Kräutermayonnaise – im Miniglas –", 3.40))
items.append(ff("ff-hamburger-matjessalat-miniglas", "Hamburger Matjessalat mit Roter Beete, Gewürzgurken, Äpfeln und Frühlingszwiebeln, mit Creme Fraîche und Kerbel angeschmeckt – im Miniglas –", 3.40))
items.append(piece(
    "ff-brotkorb-dips", "Brotkorb und passende Dips", "Fingerfood Einzelteile", "Fingerfood",
    1.75, min_order=10, unit_label="Person", price_type="person",
    description="Empfehlung zum Fingerfood.", diet_type="vegetarian",
))

items.append(ff("ff-mini-sahne-windbeutel", "Mini-Sahne-Windbeutel", 1.35, diet="veg"))
items.append(ff("ff-mini-schoko-eclair", "Mini-Schoko-Eclair mit zarter Vanillefüllung", 1.35, diet="veg"))
items.append(ff("ff-schoko-blaubeer-muffin", "Schokoladen- oder Blaubeer-Muffin", 1.85, diet="veg"))
items.append(ff("ff-kaese-fruechte-spiess", "Spieß von zweierlei Käse und Früchten", 3.00, diet="veg"))
items.append(ff("ff-creme-caramell-tasse", "Crème Caramell in der Mini-Tasse serviert", 2.05, diet="veg"))
items.append(ff("ff-exotischer-fruechtespiess", "Exotischer Früchtespieß der Saison", 2.50, diet="vegan"))
items.append(ff("ff-praline-butterkuchen", "Praline vom Butterkuchen (pro Pers. 2 Stück)", 2.10, diet="veg"))
items.append(ff("ff-kokosreisbaellchen", "Gefüllte Kokosreisbällchen", 2.50, diet="vegan"))
items.append(ff("ff-mini-chili-schoko-banane", "Mini-Chili-Schoko-Banane", 2.50, diet="vegan"))
items.append(ff("ff-mini-banane-kuvertuere", "Mini-Banane in einem Mantel von zweierlei Kuvertüren", 2.65, diet="vegan"))
items.append(ff("ff-amarenakirschen-spiess", "Spieß von Amarenakirschen, Ananas und Weintrauben mit Kuvertüre überzogen", 2.80, diet="vegan"))
items.append(ff("ff-fruechte-schokomantel", "Früchte der Saison im Schokomantel (pro Pers. 3 Stück)", 3.50, diet="vegan"))
items.append(ff("ff-obstspalten-frisch", "Frische Obstspalten von Früchten der Saison (pro Pers. 5 Stück)", 4.65, diet="vegan"))

items.append(ff("ff-ananaswuerfel-kokosnuss", "Frische Ananaswürfel mit gerösteter Kokosnuss und Honig", 1.80, diet="vegan"))
items.append(ff("ff-praline-schoko-erdbeere", "Praline von der Schoko-Erdbeere – saisonbedingt –", 1.80, diet="veg"))

items.append(ff("ff-mascarpone-honigcreme-miniglas", "Mascarpone-Honigcreme mit einem Trauben-Minzsalat geschichtet – im Miniglas –", 3.50, diet="veg"))
items.append(ff("ff-kirschmousse-miniglas", "Kirschmousse mit Bisquit, Kaffeelikör und Schokoladensplittern – im Miniglas –", 3.50, diet="veg"))
items.append(ff("ff-mandelcreme-pistazien-miniglas", "Mandelcreme mit Pistazien, Orangenkompott und Ananas geschichtet – im Miniglas –", 3.50, diet="vegan"))
items.append(ff("ff-mousse-schokolade-erdbeere-miniglas", "Mousse von zweierlei Schokoladen, Erdbeerpüree und kandierten Pinienkernen – im Miniglas –", 3.50, diet="vegan"))
items.append(ff("ff-limonen-joghurtcreme-miniglas", "Limonen-Joghurtcreme mit Mangosalat und gerösteter Kokosnuss – im Miniglas –", 3.50, diet="veg"))
items.append(ff("ff-orangen-safran-creme-miniglas", "Orangen-Safran-Creme mit Karamellsauce marmoriert – im Miniglas –", 3.50, diet="veg"))

# ============================================================
# SUPPENSPEZIALITÄTEN (p.15-16) — "ab mindestens 10 Portionen einer Sorte"
# ============================================================
def soup(id_, name, price, diet=None):
    d = "vegetarian" if diet == "veg" else "omnivore"
    return piece(id_, name, "Suppenspezialitäten", "Suppe", price, min_order=10, unit_label="Portion (0,3l)", diet_type=d,
                 description="Als vollwertiger, leicht bekömmlicher Mittagstisch im Büro oder als Ergänzung im Büffet. Eine Portion entspricht 0,3l; dazu ausreichend hausgebackenes Brot.")

items.append(soup("suppe-tomatencreme", "Tomatencremesuppe mit Basilikumpesto", 5.00, diet="veg"))
items.append(soup("suppe-karotten-ingwer", "Karotten-Ingwercremesuppe mit gerösteten Honig-Pinienkernen", 5.00, diet="veg"))
items.append(soup("suppe-pfefferrahm", "Pfefferrahmsuppe von grünem Pfeffer und Feigen, abgeschmeckt mit Anislikör", 5.00, diet="veg"))
items.append(soup("suppe-kartoffelcreme-flusskrebs", "Aufgeschlagene Kartoffelcremesuppe mit Schnittlauch und Flußkrebsen (auf Wunsch separat)", 6.00))
items.append(soup("suppe-kartoffel-deftig", "Deftige Kartoffelsuppe mit Karotten, Sellerie und Lauch gekocht, dazu gebratene Mettwurst (auf Wunsch separat) und Croûtons", 6.00))
items.append(soup("suppe-suesskartoffel", "Suppe von pürierten Süßkartoffeln, roter Chili und gerösteter Hähnchenbrust", 6.00))
items.append(soup("suppe-schweizer-kaese-lauch", "Schweizer Käse-Lauchsuppe mit Gartenkresse, etwas Sauerrahm und mariniertem Hackfleisch", 6.00))
items.append(soup("suppe-ungarische-gulasch", "Ungarische Gulaschsuppe mit Rindfleisch, Zwiebeln, Paprika und Champignons", 6.90))
items.append(soup("suppe-soljanka", "Soljanka klassisch gekocht mit frischem Gemüse, Creme Fraîche, Kasseler, gerösteter Fleischwurst, Gewürzgurken, süß-säuerlich abgeschmeckt", 6.00))
items.append(soup("suppe-indische-curry", "Indische Currysuppe mit Ananas, Banane und Hähnchenbrust-Sesamstick (auf Wunsch auch vegetarisch)", 6.00))
items.append(soup("suppe-orientalische-creme", "Orientalische Cremesuppe mit Linsen, etwas Knoblauch und Kreuzkümmel, Rindfleisch und Koriander", 6.00))
items.append(soup("suppe-thai-zitronengras", "Thailändische Zitronengrassuppe mit Pilzen, kleinen Tomaten, Chili, Limettensaft und Scampi – scharf –", 6.50))
items.append(soup("suppe-thai-kokos", "Thailändische Kokossuppe mit Hähnchenbruststreifen, Strauchtomaten, Champignons, Sprossen, Pak Choi und Koriander", 6.00))

# ============================================================
# RUSTIKALE BÜFFETS (p.16-19) — "Lieferbar ab 10 Personen"
# ============================================================
items.append(buffet(
    "rustikales-buffet-1", "Rustikales Büffet I", "Rustikale Büffets", "Büffet", 24.00, min_order=10,
    kalt=(
        "Krautsalat mit Orangen und Nüssen – vegetarisch –",
        "Hausgemachter Kartoffelsalat in einer Marinade von Eiern, Senf und Kräutern – vegetarisch –",
        "Marinierter Salat von grünen Bohnen, Speckwürfeln und Paprika",
        "Hausgebackenes Brot im Korb",
    ),
    warm=("Saftiger Braten vom Schwein oder Pute auf einer Schalotten-Bratensauce, mit Vierländer Gemüse und Kartoffelgratin",),
    dessert=("Erdbeermousse mit Schokoladensauce marmoriert",),
))
items.append(buffet(
    "rustikales-buffet-2", "Rustikales Büffet II", "Rustikale Büffets", "Büffet", 27.50, min_order=10,
    kalt=(
        "Herzhafte Aufschnittplatte bunt gemischt mit saurem Gemüse und Gebäckstangen",
        "Heringssalat mit roten Zwiebeln, Kartoffelscheiben, Gurken und Gartenkräutern",
        "Bunte Frikadellen-Platte auf gebratener Paprika in Tomaten-Salsa",
        "Lombardischer Gemüsekuchen – vegetarisch –",
        "Hausgebackenes Brot im Korb",
    ),
    warm=("Glasierter Schweinebraten in einer kräftigen Bratenjus mit Apfelrotkohl und Kartoffelklößen",),
    dessert=("Mousse au Chocolat mit Vanillesauce",),
))
items.append(buffet(
    "rustikales-buffet-3", "Rustikales Büffet III", "Rustikale Büffets", "Büffet", 29.90, min_order=10,
    kalt=(
        "Matjesfilets auf einem Apfel-Sauerrahm",
        "Kleine Kartoffeln mit Altländer Geflügelsalat gefüllt",
        "Salat von geraspeltem Sellerie, Karotten, Zitrusfrüchten und Nüssen – vegetarisch –",
        "Aufgeschnittener Katenschinken mit Mixed Pickles",
        "Kleine Hackbällchen mit einer Senf-Estragonhaube auf mariniertem Weißkraut",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Aufgeschlagene Kürbiscremesuppe mit Flußkrebsen",
        "Rinderbraten, langsam im Gemüse-Bratenjus geschmort, dazu Wirsinggemüse und kleine Röstkartoffeln",
    ),
    dessert=(
        "Hamburger Rote Grütze mit sahniger Vanillesauce",
        "Frischkäse-Birnencreme mit Schokoladensauce marmoriert",
    ),
))
items.append(buffet(
    "rustikales-buffet-4", "Rustikales Büffet IV", "Rustikale Büffets", "Büffet", 32.90, min_order=10,
    kalt=(
        "Salat mit Eiern, eingelegtem Gemüse und Ananas in einer Currycreme – vegetarisch –",
        "Deftiger Nudelsalat mit gerösteten Speckwürfeln, Paprika, Gurken und Tomaten",
        "Sauerrahm-Weißkrautsalat mit kleinen Fleischspießen",
        "Rosa gebratenes Roastbeef auf Feldsalat, dazu Remouladensauce",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Hamburger Pannfisch auf einer Senfsauce, mit Röstkartoffeln",
        "Aufgeschnittener Burgunderbraten in einer kräftigen Bratensauce, dazu ein Gemüse-Kartoffelgratin",
    ),
    dessert=(
        "Hamburger Rote Grütze mit Vanillesauce",
        "Dunkles Mousse au Chocolat",
    ),
))
items.append(buffet(
    "hamburg-klassisch", "Hamburg Klassisch", "Rustikale Büffets", "Büffet", 28.90, min_order=10,
    kalt=(
        "Norddeutscher Kartoffelsalat mit gekochtem Schinken, Eiern und Gurken",
        "Vollkorntaler mit geräuchertem Lachs und Forelle belegt mit zweierlei Kaviar garniert",
        "Rosa gebratener Jungschweinerücken auf einem Mix von Weißkraut und Creme Fraîche",
        "Hausgemachter Zwiebelkuchen mit Fenchel und geröstetem Speck",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Cremesuppe von frischen Erbsen und Kresse – vegetarisch –",
        "Gefüllter Geflügelbraten in einer Apfel-Portweinjus, dazu kleine Röstkartoffeln und Speckbohnen",
    ),
    dessert=("Geschichtetes Mousse von Quark, Vanille und rotem Beerenkompott",),
))
items.append(buffet(
    "hanseaten-buffet", "Hanseaten Büffet", "Rustikale Büffets", "Büffet", 44.50, min_order=20,
    note="Ab 20 Personen; unter 20 Personen ohne Lachs, dafür Schaustück von der Lachsforelle.",
    kalt=(
        "Marinierte Champignons in Sour Cream und frischen Kräutern – vegetarisch –",
        "Jungschweinerücken mit Sauce Cumberland",
        "Kleine Kartoffeln mit Creme Fraîche und Matjestatar gefüllt",
        "Rosa Gebratenes vom Roastbeef mit Mixed Pickles und Remoulade",
        "Schaustück vom pochierten Atlantiklachs (ab 20 Personen; sonst Schaustück von der Lachsforelle)",
        "Große Auswahl von Räucherfischen der Saison",
        "Kartoffelsalat mit gebratenem Speck und Schnittlauch",
        "Frischer Krautsalat mit Gurken, Tomaten und Paprika – vegetarisch –",
        "Hähnchenbrust mit Früchten der Saison",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Pürierte Kräutercremesuppe mit Einlage – vegetarisch –",
        "Saftiger Schweinenackenbraten mit einer Senf-Kräutersauce, dazu Semmelknödel",
    ),
    dessert=(
        "Hamburger Rote Grütze mit Vanillesauce",
        "Mousse au Chocolat auf Waldbeerenmark",
    ),
))

# ============================================================
# FESTTAGS-BÜFFETS (p.19-21) — "Lieferbar ab 10 Personen"
# ============================================================
items.append(buffet(
    "festtagsbuffet-1", "Festtagsbüffet I", "Festtags-Büffets", "Büffet", 32.90, min_order=10,
    kalt=(
        "Lachspralinen in einem Mantel von Honig, Dill und Senf auf einem Zuckerschotensalat",
        "Rosa Gebratenes vom Rind und Schwein auf einem bunten Spargelratatouille, mit hausgemachter Remouladensauce",
        "Gebratene Riesengarnelen in rotem Pesto",
        "Karamellisierte Chicoréeschiffchen mit einem Gemüseragout und Roquefort gefüllt – vegetarisch –",
        "Tranchen von der Poulardenbrust mit Orangenconfit auf Frühlingssprossen",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Champignon-Kressecremesuppe mit Pinienkernen – vegetarisch –",
        "Schweinefilet mit Sauce Béarnaise gratiniert, auf einer Rahmsauce mit grünem Pfeffer, dazu geschwenktes Frühlingsgemüse und Rösti",
    ),
    dessert=(
        "Joghurtcreme mit frischen Erdbeeren und Minze",
        "Geschichtetes Mousse von zweierlei Schokoladen",
    ),
))
items.append(buffet(
    "festtagsbuffet-2", "Festtagsbüffet II", "Festtags-Büffets", "Büffet", 39.50, min_order=10,
    kalt=(
        "Hausgebeizter Fjordlachs auf verschiedenen Blattsalaten mit einem Pinienkern-Honig-Dressing mariniert",
        "Kleine Lasagne von Auberginen, Zucchini und getrockneten Tomaten – vegetarisch –",
        "Glasierte Entenbrust, rosa gebraten auf einem Champignon-Lauchsalat",
        "Gegrillte Scampi in einer Zitronen-Aioli",
        "Kleine Medaillons vom Rinderfilet mit Kräutermousse gratiniert",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Pochierte Filets vom Lachs und Tropenbarsch in einer Champignonsauce mit grünem Spargel und einem Mix aus Duft- und Wildreis",
        "Aufgeschnittener Kalbsbraten in einer Cognac-Morchelrahmsauce, dazu Kartoffelgratin und ein Karotten-Bohnen-Gemüse",
    ),
    dessert=(
        "Creme von Minze, Schokolade und Mandellikör",
        "Tiramisu von der Kokosnuss und Kaffee",
    ),
))
items.append(buffet(
    "festtagsbuffet-3", "Festtagsbüffet III", "Festtags-Büffets", "Büffet", 37.90, min_order=10,
    kalt=(
        "Gerollte Mini-Crêpes mit grünem Spargel und Räucherlachs auf einem Kräuter-Sauerrahm",
        "Rosa gebratene Entenbrust auf Frühlingssalat mit einem Honig-Sesam-Dressing",
        "Kleiner Spargelkuchen mit buntem Gemüse und Käse gebacken – vegetarisch –",
        "Kleine, neue Kartoffeln mit einem Champignon-Schnittlauchsalat gefüllt – vegetarisch –",
        "Salat von geraspelten Karotten, Weißkohl, Frühlingslauch, Äpfeln und Orangen in einer leichten Kerbelmayonnaise – vegetarisch –",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Klare Geflügelconsommé mit Gemüsejulienne und kleinen Kräutermaultaschen",
        "Pochierte Lachsfilets in einer Riesling-Dillsauce, mit tomatisiertem Blattspinat und gemischtem Reis",
        "Aufgeschnittene Lammkeule in einer Portwein-Schalottensauce, dazu ein gebratener Rosmarinkartoffel-Gemüsemix",
    ),
    dessert=(
        "Erdbeer-Pistazienmousse mit Karamellmandeln",
        "Kleine Hamburger Kirschtorte",
    ),
))

# ============================================================
# VEGETARISCHE BÜFFETS (p.21-22) — diet_type=vegetarian
# ============================================================
items.append(buffet(
    "vegetarisches-buffet-1", "Vegetarisches Büffet I", "Vegetarische Büffets", "Büffet", 24.30, min_order=10, diet_type="vegetarian",
    kalt=(
        "Zucchiniröllchen mit einem Frischkäse-Ruccola-Mix gefüllt",
        "Quiche von frischen Gartengemüsen und Pinienkernen",
        "Kleine Pizza von Auberginen, Tomatenconfit und Schafskäse",
        "Marinierter Spieß von Tomaten, Mozzarella und Pesto",
        "Persische Teigröllchen mit Estragon, Minze und Auberginen-Walnussmousse gefüllt",
        "Hausgebackenes Brot im Korb",
    ),
    warm=("Lasagne von Blattspinat, Lauchzwiebeln und Austernpilzen in einer Tomaten-Olivensauce mit Mozzarella gratiniert",),
    dessert=(
        "Panna Cotta mit einer Sauce von zweierlei Kirschen",
        "Marinierte Früchte auf Vanille-Kokosmousse",
    ),
))
items.append(buffet(
    "vegetarisches-buffet-2", "Vegetarisches Büffet II", "Vegetarische Büffets", "Büffet", 31.50, min_order=10, diet_type="vegetarian",
    kalt=(
        "Bunter Salat von Pasta, Austernpilzen, Lauch, Olivenöl und weißem Balsamico",
        "Teigtaschen mit einem Mais-Zwiebelmix und Mozzarella",
        "Kleine Kartoffeln mit einem Spargelsalat und Creme Fraîche gefüllt",
        "Mini-Wraps mit einer Füllung von Frischkäse, Gartenkräutern und Kresse",
        "Salat von grünen Bohnen mit Strauchtomaten und roten Zwiebeln",
        "Gurkenschiffchen mit einem Gemüsetatar gefüllt",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Karottencremesuppe mit Kerbel und gerösteten Honig-Pinienkernen",
        "Marinierter Tofu mit geschwenktem Kräutergemüse und Zitronenkartoffeln, auf einer Champignonsauce",
    ),
    dessert=(
        "Joghurt-Birnencreme mit Erdbeerkompott",
        "Schokoladenmousse mit Mandellikör und Weintrauben",
    ),
))
items.append(buffet(
    "vegetarisches-buffet-3", "Vegetarisches Büffet III", "Vegetarische Büffets", "Büffet", 30.90, min_order=10, diet_type="vegetarian",
    kalt=(
        "Geschmorter Staudensellerie auf einem süß-sauren Linsensalat",
        "Kleine Gemüsekuchen mit Artischocken und Paprika gebacken",
        "Spieß vom gegrillten Tofu, Champignons und Cherrytomaten in einer Sesam-Ingwermarinade",
        "Cous-Cous Salat mit Blattpetersilie, gebratenen Gemüsewürfeln und Orangenfilets mit einer Currycreme überzogen",
        "Türmchen von Zucchini, Aubergine und Paprika auf Kresseschaum",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Tomatencremesuppe mit grünem Pesto und Knoblauchcroûtons",
        "Blätterteigtaschen mit einem pikanten Schafskäse-Gemüsemix gefüllt, dazu eine Fenchel-Bohnensauce und gemischter Reis",
        "Spieß von gebratenem Antipasti-Gemüse mit frischen Kräutern",
    ),
    dessert=(
        "Mandarinen-Joghurtmousse mit Minze",
        "Creme von Pistazien mit einer Beerensauce marmoriert",
    ),
))

# ============================================================
# VEGANE BÜFFETS (p.23) — diet_type=vegan
# ============================================================
items.append(buffet(
    "veganes-buffet-1", "Veganes Büffet I", "Vegane Büffets", "Büffet", 19.80, min_order=10, diet_type="vegan",
    kalt=(
        "Glasnudelsalat mit asiatischem Gemüse, Pak Choi und Mais",
        "Spieß von gegrilltem Tofu, Mango und Peperoni",
        "Vegane Chili-Gemüsebällchen im Zucchinimantel",
        "Hausgebackenes Brot im Korb",
    ),
    warm=("Thai Curry mit Kokos, Wasserspinat, Lytchee und Koriander, dazu Nussreis",),
    dessert=("Mango-Vanillekompott mit Orangen und Pistazien",),
))
items.append(buffet(
    "veganes-buffet-2", "Veganes Büffet II", "Vegane Büffets", "Büffet", 22.90, min_order=10, diet_type="vegan",
    kalt=(
        "Kleine Auberginenpizza mit Zucchini, Tomate und Pinienkernen",
        "Bruschetta mit Petersilie, Olive, Paprika und Oregano",
        "Klassischer Gurkenstreifensalat mit Zitronenessig und Dilldressing",
        "Hausgebackenes Brot im Korb",
    ),
    warm=("Gazpacho mit frischem Gemüse und Pesto-Fenchel-Zuckerschotengemüse an Dattelsauce mit geschwenkten Glasnudeln",),
    dessert=("Marsala-Birnen mit Traubensalat",),
))
items.append(buffet(
    "veganes-buffet-3", "Veganes Büffet III", "Vegane Büffets", "Büffet", 25.50, min_order=10, diet_type="vegan",
    kalt=(
        "Linsensalat mit Chili, Staudensellerie, Basilikum und gegrilltem Gemüse",
        "Rotes Reisplättchen mit Minzgelee und Mandeln",
        "Spieß von Roter Beete, Kohlrabi und karamellisierte Karotten",
        "Hausgebackenes Brot im Korb",
    ),
    warm=("CousCous mit Minze, Tomate, Gurke, Koriander und Limette serviert",),
    dessert=("Apfel-Quittenpudding mit Tonkabohne",),
))

# ============================================================
# LÄNDER-BÜFFETS (p.24-29) — "Lieferbar ab 10 Personen"
# ============================================================
items.append(buffet(
    "italienisches-buffet-1", "Italienisches Büffet I", "Länder-Büffets", "Italienisch", 31.00, min_order=10,
    kalt=(
        "Tomate-Mozzarella mit frischem Basilikum, Olivenöl und altem Balsamico – vegetarisch –",
        "Roulade von Auberginen, Rucola und geschmolzenem Käse in mediterranen Kräutern mariniert – vegetarisch –",
        "Kleine Medaillons von Mittelmeerfischen auf gebratenem Fenchel in einer Sesammarinade",
        "Zucchiniröllchen mit Blattspinat und Creme Fraîche gefüllt – vegetarisch –",
        "Gebratene Champignons mit Oregano und Knoblauch – vegetarisch –",
        "Gegrillte Paprika mit Kapern, Thunfisch und Zitronenthymian",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Kleine Schnitzel vom Schweinerücken mit Schinken und Salbei gefüllt in einer Marsalajus, dazu Olivenkartoffeln mit Rosmarin und Limonen",
        "Vegetarische Lasagne von Blattspinat, Gorgonzola, Tomaten und Pinienkernen",
    ),
    dessert=("Panna Cotta auf rotem Beerenkompott mit Schokoladen-Früchten garniert",),
))
items.append(buffet(
    "italienisches-buffet-2", "Italienisches Büffet II", "Länder-Büffets", "Italienisch", 35.00, min_order=10,
    kalt=(
        "Artischockenherzen auf roter Paprikacreme mit geröstetem Salbei – vegetarisch –",
        "Tranchen von der Hähnchenbrust auf Olivenpesto mit frischen Kräutern und karamellisierten Walnüssen",
        "Marinierte Kartoffelscheiben mit Rucola und gegrillter Lauchzwiebel – vegetarisch –",
        "Medaillons vom Schweinefilet in einem Mantel von Sesam und Pflaumen",
        "Kleine Zucchinischiffchen mit Rinderhackfleisch und Chili-Confit gefüllt",
        "Hausgebackenes Brot im Korb",
    ),
    warm=("Geschmorte Lammhaxen in einer Rosmarinjus, dazu geschmortes mediterranes Gemüse und Kartoffelgratin",),
    dessert=("Frischer Fruchtsalat unter einer Haube von Frischkäse und Vanille",),
))
items.append(buffet(
    "italienisches-buffet-3", "Italienisches Büffet III", "Länder-Büffets", "Italienisch", 32.90, min_order=10,
    kalt=(
        "Gebratene grüne Bohnen mit Austernpilzen und Spargel – vegetarisch –",
        "Bunter Pastasalat mit Oliven, Lauchzwiebeln, Strauchtomaten, Olivenöl und hellem Balsamico – vegetarisch –",
        "Kleine Scampispieße mit gebratener Paprika in einer Knoblauchmarinade",
        "Rosa gebratener Schweinerücken mit einer leichten Thunfischcreme und Kapern gefüllt",
        "Tomate-Mozzarella mit Basilikum – vegetarisch –",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Minestrone, klassisch gekocht mit viel Gemüse und gerösteten Speckwürfeln",
        "Geschmorter Rinderbraten in einer Chianti-Rosmarinsauce, dazu gebratene Kartoffeln mit Zitronen und Meersalz",
    ),
    dessert=(
        "Mascarponecreme mit Amarettokirschen",
        "Klassisches Tiramisu",
    ),
))
items.append(buffet(
    "italienisches-buffet-4", "Italienisches Büffet IV", "Länder-Büffets", "Italienisch", 39.90, min_order=10,
    kalt=(
        "Gebratener Seebarsch auf Zucchini mit Ziegenkäse überbacken",
        "Grüne Blattsalate mit Knoblauchcroûtons, Champignons und gehobeltem Parmesan – vegetarisch –",
        "Antipasti von dreierlei eingelegtem Gemüse – vegetarisch –",
        "Sülze von der Cherrystrauchtomate im Mozzarellamantel",
        "Vielfältige Fingerfoodsticks im Kressenest",
        "Schafskäse mit Honig im Strudelsack und Tomatenconfit – vegetarisch –",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Tomaten-Orangensuppe – vegetarisch –",
        "Hähnchenbrust im Sesammantel mit tomatisierten Gnocchi und frischem Gemüse",
        "Filet vom Mittelmeerfisch auf Gemüse-Basmatireis mit Safransauce",
        "Lasagne mit Blattspinat auf Gorgonzolasauce – vegetarisch –",
    ),
    dessert=(
        "Basilikum-Mascarponecreme im Baumkuchenmantel auf Mangosauce",
        "Panna Cotta mit Fruchtsauce",
    ),
))
items.append(buffet(
    "mediterranes-buffet", "Mediterranes Büffet", "Länder-Büffets", "Mediterran", 51.50, min_order=10,
    kalt=(
        "Salat von Zucchini, Kartoffeln, getrockneten Tomaten und Lauch – vegetarisch –",
        "Frischer Blattsalat-Mix mit Tomaten, Sprossen, Pilzen und Kräutervinaigrette – vegetarisch –",
        "Grissinistangen mit geräuchertem Schinken umhüllt",
        "Tranchen vom Schweinerücken auf einem Confit von gerösteten Zwiebeln und Beeren",
        "Kleine Hackbällchen mit einem Tomaten-Gurken-Relish",
        "Gegrillte Champignons mit einem Kräutermix und Balsamico mariniert – vegetarisch –",
        "Salat von geröstetem Fenchel, Karotten und Pinienkernen – vegetarisch –",
        "Karamellisierte Gartenpaprika in Rotweinjus geschmort – vegetarisch –",
        "Vitello Tonnato von der Putenbrust, mit Thunfischsauce und Kapern",
        "Medaillons von Mittelmeerfischen auf einem Tomatenconfit",
        "Bunter Salat von Flußkrebsen mit mediterranem Gemüse und Kräutern",
        "Geflügelmedaillons vom Grill auf einem Bett von Antipasti",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Paprikacremesuppe mit Croûtons und Schnittlauch – vegetarisch –",
        "Gefüllter Geflügelbraten in einer Kräuterjus mit mediterranem Pfannengemüse und Salbei-Gnocchi",
    ),
    dessert=(
        "Eingelegte Früchte in einem Mousse von Vanille und Quark",
        "Calvados-Apfelkompott mit einer Vanillehaube",
    ),
))
items.append(buffet(
    "franzoesisches-buffet-1", "Französisches Büffet I", "Länder-Büffets", "Französisch", 26.90, min_order=10,
    kalt=(
        "Tranchierter Jungschweinrücken im Kräutermantel auf einem Calvados-Apfelkompott",
        "Pralinés vom Lachs auf einem Pernod-Meerrettichschaum",
        "Kleine Blätterteigtaschen mit einem Pilzragout und Creme Fraîche gefüllt – vegetarisch –",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Geschmorte Poulardenbrust auf einer Bordeaux-Schalottensauce, dazu ein saftiges Ratatouille und provençalische Kartoffeln",
        "Saftige Quiche mit frischem Gemüse, Käse und Kräutern, in einer Weißweinsauce gebacken – vegetarisch –",
    ),
    dessert=(
        "Mousse von zweierlei Schokoladen mit einer kandierten Walnuss-Beerensauce geschichtet",
        "Kleine Fruchtspieße auf einem Kirschlikör-Mousse",
    ),
))
items.append(buffet(
    "franzoesisches-buffet-2", "Französisches Büffet II", "Länder-Büffets", "Französisch", 31.50, min_order=10,
    kalt=(
        "Kleine Blätterteigtaschen mit einem Gemüse-Pilzsalat gefüllt – vegetarisch –",
        "Kartoffelkuchen mit Spargeltatar und Creme Fraîche belegt – vegetarisch –",
        "Flusskrebssalat mit Tomaten-Concassée und Basilikum in einer Dijon-Senf-Vinaigrette – im Miniglas angerichtet –",
        "Kleine Quiche mit Auberginen und Zucchini – vegetarisch –",
        "Tranchen von der Barbarie-Entenbrust auf karamellisierten Honigkarotten",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Cremesuppe von grünem Pfeffer, Feige und Pernod – vegetarisch –",
        "Glasierter Schweinebraten in einer Rotwein-Mandelsauce, mit einem Gratin von Zucchini, Kartoffeln und Rosmarin",
    ),
    dessert=("Mousse au chocolat mit Grand Marnier-Orangenkompott",),
))
items.append(buffet(
    "griechisches-buffet", "Griechisches Büffet", "Länder-Büffets", "Griechisch", 24.00, min_order=10,
    kalt=(
        "Verschiedene Blattsalate mit Schafskäse, Oliven, Peperoni, Gurken und Tomaten, dazu ein Kräuterdressing mit etwas Honig abgeschmeckt – vegetarisch –",
        "Gebratene Auberginenscheiben mit Tomaten und Käse gratiniert – vegetarisch –",
        "Gegrillte Hähnchenbruststreifen im Zucchinimantel",
        "Kleine Blätterteigtaschen mit einem Gemüseragout gefüllt, dazu Tzatziki – vegetarisch –",
        "Hausgebackenes Brot im Korb",
    ),
    warm=("Griechischer Hackbraten mit Schafskäse und Kräutern kräftig gewürzt, auf einer Thymiansauce, dazu ein Mix von kleinen, gebratenen Kartoffeln und Gemüse",),
    dessert=("Joghurt-Honigmousse mit Trauben",),
))
items.append(buffet(
    "mexikanisches-buffet", "Mexikanisches Büffet", "Länder-Büffets", "Mexikanisch", 29.90, min_order=10,
    kalt=(
        "Avocado-Bohnensalat mit Orangen und Koriander – vegetarisch –",
        "Enchiladas mit einer würzigen Hackfleischfüllung",
        "Tacos mit einer feurigen Füllung von Paprika, roten Bohnen und Tomaten – vegetarisch –",
        "Kleine Schweinefleischspieße in einer kräftigen Grillmarinade",
        "Spieße von Ananas und Hähnchenbrust im Sesammantel",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Maiscremesuppe mit Rindfleischstreifen",
        "Geflügel-Chili mit Zwiebeln, Kidney-Bohnen und Lauch geschmort, dazu geröstete Kartoffeln",
    ),
    dessert=("Orangenmousse mit kleinen Tequillakeksen geschichtet",),
))
items.append(buffet(
    "karibisches-buffet", "Karibisches Büffet", "Länder-Büffets", "Karibisch", 31.00, min_order=10,
    kalt=(
        "Chicken BBQ, verschieden mariniert und auf Bambus gespießt",
        "Pikanter Salat von tropischen und heimischen Kartoffeln mit Kokosfleisch, geröstetem Speck und rotem Chili",
        "Rosa gebratenes Schweinefilet im Sesammantel auf einem Sprossen-Kohl-Mix",
        "Gebratener Reis als Salat mit Shrimps, Ananas und geraspelter Gurke angerichtet",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Cremesuppe von Bananen und roten Linsen mit etwas Chiliöl abgeschmeckt – vegetarisch –",
        "Kräftiges Kokoscurry vom Rind mit Pilzen und grünem Gemüse, dazu ein Kartoffel-Mais-Püree",
    ),
    dessert=(
        "Mangomousse mit rotem Beerenmark durchzogen",
        "Kokoscreme mit Kaffeelikör und Bisquit",
    ),
))
items.append(buffet(
    "orientalisches-buffet", "Orientalisches Büffet", "Länder-Büffets", "Orientalisch", 39.90, min_order=10,
    kalt=(
        "Cous-Cous Salat mit Rosinen, mariniertem Hähnchenfleisch und gebratenem Gemüse",
        "Kleine orientalische Teigröllchen mit einem Auberginen-Walnuss-Minze-Mousse gefüllt, dazu ein Gurken-Joghurtdip – vegetarisch –",
        "Kleine Medaillons vom Meerbarsch auf einem Orangen-Linsensalat, mit einer pikanten Kichererbsenpaste",
        "Gegrillte Paprika mit Kapern und Okraschoten in einer Sesamvinaigrette – vegetarisch –",
        "Mini-Putenkebab in einer Safran-Joghurtmarinade",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Orientalische Suppe von zweierlei Linsen, Kräutern und Tomatenwürfeln, mit Zitrone und Kreuzkümmel abgeschmeckt",
        "Geschmorte Lammhaxen in einer Granatapfelsauce, dazu Ofengemüse und Duftreis mit Berberitzen",
    ),
    dessert=(
        "Pistaziencreme mit Honigmandeln",
        "Karamellisierte Orangen mit Safran und Vanillemousse geschichtet",
    ),
))

# ============================================================
# THAILÄNDISCHE BÜFFETS (p.29-31)
# ============================================================
items.append(buffet(
    "thailaendisches-buffet-1", "Thailändisches Büffet I", "Thailändische Büffets", "Thailändisch", 24.90, min_order=10,
    kalt=(
        "Vegetarisch gefüllte Wan Tan auf einem süß-sauren Chili-Sprossensalat – vegetarisch –",
        "Fein gehacktes und gebratenes Schweinefleisch mit Glasnudeln in einer Limonen-Koriandermarinade",
        "Verschiedenes frittiertes Thai-Fingerfood mit Tomaten-Chilidip",
        "Hausgebackenes Brot im Korb",
    ),
    warm=("Rotes Thai-Curry mit geschnetzeltem Rindfleisch, Pak Choi, Trauben und Basilikum, dazu Duftreis – etwas scharf –",),
    dessert=("Mangomousse mit Schokoladensauce und Lytcheesalat durchzogen",),
))
items.append(buffet(
    "thailaendisches-buffet-2", "Thailändisches Büffet II", "Thailändische Büffets", "Thailändisch", 26.50, min_order=10,
    kalt=(
        "Glasnudelsalat mit Thai-Gemüse, Koriander, Limone und Chili – vegetarisch –",
        "Saté von der Hähnchenbrust in einer Erdnuss-Kokossauce",
        "Pikanter Salat von geröstetem Hackfleisch, roten Zwiebeln und Lauch",
        "Gebratene Teigtaschen, vegetarisch gefüllt, mit einem süß-sauren Chilidip – vegetarisch –",
        "Hausgebackenes Brot im Korb",
    ),
    warm=("Grünes Rindfleischcurry mit Kokosmilch, Pak Choi, Mango und süßem Basilikum, dazu Duftreis",),
    dessert=("Mousse von Kokosnuss und tropischen Früchten mit Schokoladensauce marmoriert",),
))
items.append(buffet(
    "thailaendisches-buffet-3", "Thailändisches Büffet III", "Thailändische Büffets", "Thailändisch", 28.90, min_order=10,
    kalt=(
        "Pikanter Salat mit Hähnchenbruststreifen, gebratenen Reisnudeln, Papaya und Wasserspinat",
        "Kleine Satés vom Schwein in einer Kokos-Erdnusssauce",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Kokos-Zitronengrassuppe mit marinierten Scampis, Pilzen, Gemüse und Koriander",
        "Geröstetes Lammfleisch in einer milden Massaman-Sauce mit Kartoffeln, Erdnüssen, thailändischem Gemüse und Kräutern, dazu gebratener Duftreis",
    ),
    dessert=("Cremiger Kokosmilchreis mit einem Orangen-Traubenkompott geschichtet",),
))
items.append(buffet(
    "thailaendisches-buffet-4", "Thailändisches Büffet IV", "Thailändische Büffets", "Thailändisch", 35.00, min_order=10,
    kalt=(
        "Verschiedene Saté von Schwein und Geflügel auf einem Gurken-Chili-Salat mit Koriander",
        "Kleine Teigtaschen auf einem Sprossen-Mix mit süßem Reisessig – vegetarisch –",
        "Duftreissalat mit geschnetzelter Poulardenbrust, Frühlingszwiebeln und gebratenem Thaigemüse – im Glas angerichtet –",
        "Shrimpscocktail mit eingelegtem Ingwer und kandierter Limette in Palmzucker-Essigmarinade",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Zitronengrassuppe mit Scampi, Pilzen und verschiedenen Gemüsen – spicy –",
        "Rindfleischstreifen in einer pikanten Kokossauce mit Wasserspinat und Pak Choi, dazu Jasminreis mit Cashewnüssen",
    ),
    dessert=("Mousse von frischer Mango mit einem Papaya-Lytcheepüree marmoriert",),
))
items.append(buffet(
    "thailaendisches-buffet-5", "Thailändisches Büffet V", "Thailändische Büffets", "Thailändisch", 35.50, min_order=10,
    kalt=(
        "Scampi in Tempurateig gebacken, mit einem süßen Chilidip",
        "Rindfleischsalat mit Limone, roten Zwiebeln, Karotten und Chili – etwas scharf –",
        "Verschiedene Spieße von Hähnchen und Schwein auf einem Gurken-Radieschensalat",
        "Vegetarischer Glasnudelsalat mit grünem Gemüse, junger Kokosnuss und Tomate, in einer Marinade mit geröstetem Sesam und Honig – vegetarisch –",
        "Kleine Auswahl von verschiedenen, frittierten Teigtaschen mit vegetarischer Fleisch- und Fischfüllung auf knusprigen Reisnudeln",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Tom Yam Gung – scharf säuerliche Suppe mit Riesengarnelen, Chili, Tomaten, Koriander und Champignons",
        "Pikantes Enten-Kokoscurry mit Pak Choi, Mango, Trauben und kleinen Maiskolben, dazu Jasminreis mit gerösteten Cashewnüssen",
    ),
    dessert=("Salat von tropischen Früchten in einer Palmzuckermarinade / Tropisches Kokosmousse mit einer Nuss-Karamellsauce marmoriert",),
))

# ============================================================
# GRILLBÜFFETS (p.32-34) — "Lieferbar ab 10 Personen"
# ============================================================
items.append(buffet(
    "grillbuffet-1", "Sommerliches Grillbüffet I", "Grillbüffets", "Grillbüffet", 25.00, min_order=10,
    kalt=(
        "Hausgemachter Nudelsalat mit Mais, Gurken und Kräutern – vegetarisch –",
        "Salat von Kartoffeln, Ei, geröstetem Speck und Lauch",
        "Weißkrautsalat mit Paprika und kleinen Tomaten – vegetarisch –",
        "Sour Cream, Senf, Ketchup",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Auswahl von verschiedenen Grillwürstchen",
        "Marinierte Nackensteaks vom Schwein",
        "Kleine, vorgebratene Hähnchenkeulen in einer Rosmarin-Zitronenmarinade",
        "Baked Potatoes – vegetarisch –",
    ),
    dessert=("Hamburger Rote Grütze mit Vanillesauce",),
))
items.append(buffet(
    "grillbuffet-2", "Sommerliches Grillbüffet II", "Grillbüffets", "Grillbüffet", 32.50, min_order=10,
    kalt=(
        "Bunter Salatmix mit Croûtons, Rucola, Gurken, Paprika und Tomaten, dazu eine Kräuter-Vinaigrette – vegetarisch –",
        "Kartoffelsalat mit gegrilltem Gemüse in einer Senfmarinade – vegetarisch –",
        "Kleine Rouladen von Zucchini und Auberginen mit Käse, Kräutern und Pesto gefüllt – vegetarisch –",
        "Hausgemachter Nudelsalat mit gemischtem Antipasti-Gemüse und Basilikum – vegetarisch –",
        "Sour Cream, Senf, Ketchup",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Medaillons von der Putenbrust in Curry mariniert",
        "Kleine Filets vom Lachs mit Rosmarin und Zitrone in Alupäckchen",
        "Steaks vom Schweinenacken mit Paprika und Knoblauch kräftig gewürzt",
        "Auswahl von verschiedenen Grillwürstchen",
        "Baked Potatoes – vegetarisch –",
    ),
    dessert=(
        "Creme von zweierlei Schokoladen mit rotem Beerenmark geschichtet",
        "Verschiedene Früchte der Saison auf Holz gespießt",
    ),
))
items.append(buffet(
    "grillbuffet-3", "Sommerliches Grillbüffet III", "Grillbüffets", "Grillbüffet", 41.50, min_order=10,
    kalt=(
        "Auswahl von frischen Blattsalaten mit Croûtons, Paprika, Kräuter-Schafskäse, Gurken und Tomaten, dazu eine Oregano-Vinaigrette – vegetarisch –",
        "Bunte Melonenschiffchen mit luftgetrocknetem Schinken belegt",
        "Kartoffelsalat mit zweierlei Spargel, Rucola und Gartenkräutern – vegetarisch –",
        "Tomate-Mozzarella mit Basilikum und altem Balsamico-Essig – vegetarisch –",
        "Kleine Wraps mit einer Auberginenmousse gefüllt, dazu ein Gurken-Joghurtdip – vegetarisch –",
        "Kräutersauerrahm, Senf, Ketchup",
        "Hausgebackenes Brot im Korb",
    ),
    warm=(
        "Kleine Lachsfilets in einer Limettenmarinade in Alupäckchen",
        "Kleine Steaks vom Rind",
        "Steaks vom Schweinerücken in einer mediterranen Marinade",
        "Putenmedaillons mit Curry und Ananas eingelegt",
        "Auswahl von verschiedenen Grillwürsten",
        "Gebackene Lorbeerkartoffeln",
        "Kleine Spieße von gegrilltem Gemüse – vegetarisch –",
    ),
    dessert=(
        "Obstsalat mit einem Vanillemousse überzogen",
        "Erdbeer-Frischkäsecreme mit Minze",
    ),
))
items.append(buffet(
    "grillbuffet-4", "Sommerliches Grillbüffet IV", "Grillbüffets", "Grillbüffet", 35.30, min_order=10,
    kalt=(
        "Salat von zweierlei Spargel, Kartoffeln und Basilikum – vegetarisch –",
        "Antipasti von Champignons, Paprika, Auberginen und Zucchini – vegetarisch –",
        "Mediterraner Salat von Tomaten, Paprika, Gurken, Oliven und Schafskäse, dazu ein sommerlicher Blattsalatmix und zweierlei Dressing – vegetarisch –",
        "Kleine Scampispieße mit Strauchtomaten und Lauchzwiebeln",
        "Brotkorb",
    ),
    warm=(
        "Poulardenbrust in einer Thymian-Honigmarinade",
        "Auswahl an verschiedenen Bratwürstchen",
        "Kräftig marinierte Steaks vom Schweinenacken",
        "Filets vom Mittelmeerbarsch mit mediterranen Kräutern und Limonen mariniert",
        "Baked Potatoes mit Sour Cream – vegetarisch –",
        "Senf und Ketchup",
        "Hausgebackenes Brot im Korb",
    ),
    dessert=(
        "Auswahl von hausgebackenem Blechkuchen als kleine Pralinen angerichtet",
        "Mousse von zweierlei Schokoladen mit rotem Beerenmark geschichtet",
        "Mascarponecreme mit dunklen Trauben und Maraschinokirschen",
    ),
))

# ============================================================
# Lunch_Buffets_2026.pdf — 8 buffets, "Jedes Büffet ab 10 Personen"
# (Lunch_Buffets1_2026.pdf is an identical duplicate of this file.)
# ============================================================
items.append(buffet(
    "lunch-buffet-2026-no-1", "Lunch Buffet No 1", "Lunch Buffets", "Lunch Buffet", 29.90, min_order=10,
    kalt=(
        "Karamellisierte Pinienkern Honig Möhrchen mit roten Zwiebel und Beeren Balsamico Sesamcreme",
        "Filet Stücken von der Hähnchenbrust auf Linsen Kichererbsen Salat und kleiner Salat Deko",
    ),
    warm=(
        "Rinder Hacksteaks gratiniert mit Mais, Feta und getrockneter Tomate, dazu Rosmarin Kartoffel und Austernpilz Champignonsauce",
        "Blumenkohl Falafel auf Gemüse Reis an veganer Tomaten-Sahnesauce mit etwas Thymian – vegan –",
    ),
    dessert=("Pfirsich Quark Speise mit Amarena Sauce und Minze",),
))
items.append(buffet(
    "lunch-buffet-2026-no-2", "Lunch Buffet No 2", "Lunch Buffets", "Lunch Buffet", 27.90, min_order=10,
    kalt=(
        "Zucchini Boot gefüllt mit veganem Schinkensalat und Kresse Deko – vegan –",
        "Scampi Spieß Barbecue Mayonnaise und buntem Pfeffer",
    ),
    warm=(
        "Puten Steaks in Chili Mango Sauce dazu ein Mix aus Curry Nudeln und asiatischem Gemüse",
        "Champignons gefüllt mit veganem Hackfleisch in Pesto Sahnesauce, dazu Farfalle mit marinierten Kirschtomaten – vegan –",
    ),
    dessert=("Weißes Mousse geschichtet mit Kiwi Püree und Pistazie",),
))
items.append(buffet(
    "lunch-buffet-2026-no-3", "Lunch Buffet No 3", "Lunch Buffets", "Lunch Buffet", 28.90, min_order=10,
    kalt=(
        "Apfel Walnuss Salat mit geriebener Karotte und Kohlrabi garniert mit Zitrusfrüchten – vegan –",
        "Bruschetta mit marinierten Tomaten Würfel, Basilikum und Parmesan gratiniert",
    ),
    warm=(
        "Aufgeschnittener Putenbraten in einer Trüffel Honig Jus, dazu Mandel Spätzle und geschwenkter Semmel Blumenkohl",
        "Vegetarische Frikadellen an einer Kirschtomaten-Kräuter-Sauce, dazu Gemüse Couscous mit Sesam",
    ),
    dessert=("Vegane kleine Frucht Kuchen mit Schokolade",),
))
items.append(buffet(
    "lunch-buffet-2026-no-4", "Lunch Buffet No 4", "Lunch Buffets", "Lunch Buffet", 28.50, min_order=10,
    kalt=(
        "Gegrillte Zucchini Scheiben in Oliven Öl Zitronen Vinaigrette – vegan –",
        "Bauernsalat mit Feta, Lauchzwiebel, Gemüsegurke und Oliven",
    ),
    warm=(
        "Langsam gegartes Putengulasch mit etwas Creme fraiche gekocht, dazu Makkaroni und Tomatengewürz",
        "Vegetarische Tortelloni gratiniert mit Parmesan und Blattpetersilie, dazu eine Gemüse-Sahnesauce",
    ),
    dessert=("Bananen Quarkcreme mit Schoko Bisquit Karamelsauce marmoriert",),
))
items.append(buffet(
    "lunch-buffet-2026-no-5", "Lunch Buffet No 5", "Lunch Buffets", "Lunch Buffet", 27.90, min_order=10,
    kalt=(
        "Vegane Beefröllchen gefüllt mit Himbeer-Basilikum-Mayonnaise auf Sellerie Mandarinen Salat – vegan –",
        "Blätterteigtaschen mit veganem Feta, Oregano und Tomaten Paste, dazu ein kleiner Dip – vegan –",
    ),
    warm=(
        "Grill Medaillons von der Hähnchenbrust in einer Salbei Rahmsauce, dazu Kartoffel Rüben Gratin und Gemüsestreifen in Olivenöl",
        "Geschwenkte Gnocchi mit dreierlei Bohnen und Tomaten Pestosauce – vegan –",
    ),
    dessert=("Veganer Pfirsich-Joghurt mit etwas Minze und Haselnüssen",),
))
items.append(buffet(
    "lunch-buffet-2026-no-6", "Lunch Buffet No 6", "Lunch Buffets", "Lunch Buffet", 29.50, min_order=10,
    kalt=(
        "Gebratener Antipasti Salat mit griechischen Oliven, geriebener Zitrone und Mozzarella Würfeln",
        "Vegetarischer Geflügel Gemüse Salat in einem Currydressing mariniert",
    ),
    warm=(
        "Geschnetzeltes vom Rind an einer Champignon Bratensauce, dazu Penne Rigate und geschwenkte Brokkoli Röschen",
        "Kartoffel Ecken mit Grillgemüse an Pfifferling-Rahmsauce",
    ),
    dessert=("Karamell-Grieß mit Schokoladen Splitter und Himbeer-Kirschsauce",),
))
items.append(buffet(
    "lunch-buffet-2026-no-7", "Lunch Buffet No 7", "Lunch Buffets", "Lunch Buffet", 28.50, min_order=10,
    kalt=(
        "Garnelen im Knusper-Mantel dazu ein Chili Mango Dip",
        "Cheddar Pizza von der Aubergine mit Oregano und Nüssen",
        "Tortelloni Pasta Salat mit vegetarischen Schinkenstreifen und Lauchzwiebel in einer Dill Mayonnaise",
    ),
    warm=(
        "Geschmortes Tomaten Hackbällchen Ratatouille mit italienischen Kräutern und Schalotten an einem Wildreis Mix",
        "Weiße Tagliatelle mit gedünsteten Cherry Tomaten, Schafskäse Würfeln und Rucola an einer Kresse Sauce",
    ),
    dessert=("Birnen Frischkäse Creme geschichtet mit Haselnuss Karamell Sauce",),
))
items.append(buffet(
    "lunch-buffet-2026-no-8", "Lunch Buffet No 8", "Lunch Buffets", "Lunch Buffet", 28.90, min_order=10,
    kalt=(
        "Gebratene Champignons gefüllt mit vegetarischem Hackfleisch und Creme fraiche",
        "Rucola Orangen Salat belegt mit Tandoori Kabeljau Medaillons, überzogen mit Honig Senf Dressing",
        "Zucchini Röllchen gefüllt mit Spargel Mousse und roter Beete Kugel, dekoriert mit schwarzem Sesam",
    ),
    warm=(
        "Kleine Schweinefilet Medaillons gratiniert mit Paprika Paste und Parmesan an einer Thymian Spargelsauce, dazu goldbraune Röstitaler und Butter Prinzess Bohnen",
        "Vegetarisches Curry von Brokkoli Geschnetzeltem und kleinen Filetstreifen, dazu Natur Reis",
    ),
    dessert=("Waldbeeren Mousse mit Biskuit Würfeln und Amaretto Honig",),
))

# ============================================================
# Mittagsmenue.pdf — "Bestellschein Mittagsmenue", gültig ab April 2026
# Own section, per office decision. "alle Speisen lieferbar ab mindestens
# 10 Portionen pro Gericht (separate Fleischbeilage bereits ab 1 Person)".
# ============================================================
items.append(piece(
    "mittagsmenue-m1", "M1 Veganes Soja Limetten Curry", "Mittagsmenue", "Hauptgericht", 14.00,
    min_order=10, unit_label="Portion", price_type="person", diet_type="vegan",
    description="Veganes Soja Limetten Curry mit geräuchertem Chili Tofu und asiatischen Gemüsen Sprossen Mix, dazu Basmati Reis. Mo–Fr, 11:00–14:00 Uhr; Preis inkl. Dessert, zzgl. Büffetpauschale/Anliefergebühr/MwSt.",
))
items.append(piece(
    "mittagsmenue-m2", "M2 Spaghetti mit Rucola Bärlauch Pesto", "Mittagsmenue", "Hauptgericht", 12.50,
    min_order=10, unit_label="Portion", price_type="person", diet_type="vegetarian",
    description="Spaghetti mariniert mit Rucola Bärlauch Pesto, dazu frischer Parmesan und geschwenkte Cherry Tomaten.",
))
items.append(piece(
    "mittagsmenue-m3", "M3 Rosmarin Kartoffel Frühlingsgemüse", "Mittagsmenue", "Hauptgericht", 14.00,
    min_order=10, unit_label="Portion", price_type="person", diet_type="vegan",
    description="Rosmarin Kartoffel mit Frühlingsgemüse und zweierlei Kirschtomate an einer Sahnesauce (z.B. Soja, Hafer). M3+: separat dazu Hähnchen Barbecue Streifen +5,00 €.",
))
items.append(piece(
    "mittagsmenue-m3-plus", "M3+ Zusatz: Hähnchen Barbecue Streifen", "Mittagsmenue", "Zusatzoption", 5.00,
    min_order=1, unit_label="Portion", price_type="person",
    description="Zusatzoption zu M3 — separate Fleischbeilage, bereits ab 1 Person lieferbar.",
))
items.append(piece(
    "mittagsmenue-m4", "M4 Schinken-Kartoffelauflauf", "Mittagsmenue", "Hauptgericht", 14.00,
    min_order=10, unit_label="Portion", price_type="person",
    description="Schinken-Kartoffelauflauf mit kleinen Brokkoli Röschen, Karotten und braunen Champignons, wahlweise mit vegetarischem Schinken.",
))
items.append(piece(
    "mittagsmenue-m5", "M5 Vegetarisches Geschnetzeltes", "Mittagsmenue", "Hauptgericht", 14.50,
    min_order=10, unit_label="Portion", price_type="person", diet_type="vegetarian",
    description="Vegetarisches Geschnetzeltes mit grünem Spargel und Frühlingsgemüse, dazu weiße Bandnudeln.",
))
items.append(piece(
    "mittagsmenue-m6", "M6 Lasagne mit Rinderhackfleisch", "Mittagsmenue", "Hauptgericht", 16.00,
    min_order=10, unit_label="Portion", price_type="person",
    description="Lasagne mit Rinderhackfleisch, Austernpilzen und Gemüsewürfeln in einer cremigen Bechamel gebacken.",
))
items.append(piece(
    "mittagsmenue-m7", "M7 Vegetarische Schnitzel gratiniert", "Mittagsmenue", "Hauptgericht", 16.00,
    min_order=10, unit_label="Portion", price_type="person", diet_type="vegetarian",
    description="Vegetarische Schnitzel gratiniert mit grünem Spargel Parmesan Mix, dazu eine helle Bohnen Sauce und geschwenkte Petersilien Kartoffel.",
))
items.append(piece(
    "mittagsmenue-m8", "M8 Klassisches Züricher Geschnetzeltes", "Mittagsmenue", "Hauptgericht", 16.50,
    min_order=10, unit_label="Portion", price_type="person",
    description="Klassisches Züricher Geschnetzeltes mit Spätzle, dazu ein kleiner Dill Gurken Salat; auch insgesamt vegan möglich.",
))
items.append(piece(
    "mittagsmenue-m9", "M9 Frühlings Frikadellen", "Mittagsmenue", "Hauptgericht", 17.50,
    min_order=10, unit_label="Portion", price_type="person",
    description="2 Frühlings Frikadellen gefüllt mit Lauch und Mozzarella, dazu cremiges Kartoffelpüree und Thymian Rahmsauce; auch vegetarisch möglich.",
))
items.append(piece(
    "mittagsmenue-m10", "M10 Frischer Spargel mit Hollandaise", "Mittagsmenue", "Hauptgericht", 24.00,
    min_order=10, unit_label="Portion", price_type="person", diet_type="vegetarian",
    description="Frischer Spargel (300g Rohware) mit Petersilien Kartoffeln, zerlassener Butter und Hollandaise. M10+/M10++: wahlweise Katenschinken (+4,50€) oder 2 kleine Putensteaks (+6,00€).",
))
items.append(piece(
    "mittagsmenue-m10-plus-katenschinken", "M10+ Zusatz: Katenschinken", "Mittagsmenue", "Zusatzoption", 4.50,
    min_order=1, unit_label="Portion", price_type="person",
    description="Zusatzoption zu M10 — separate Fleischbeilage, bereits ab 1 Person lieferbar.",
))
items.append(piece(
    "mittagsmenue-m10-plusplus-putensteaks", "M10++ Zusatz: 2 kleine Putensteaks", "Mittagsmenue", "Zusatzoption", 6.00,
    min_order=1, unit_label="Portion", price_type="person",
    description="Zusatzoption zu M10 — separate Fleischbeilage, bereits ab 1 Person lieferbar.",
))
# Desserts D1-D4: included in the M-price ("Preise verstehen sich inkl. Dessert");
# no separate price shown in the source — kept as zero-priced catalog rows so
# office can still reference/select the variant when composing an Angebot.
items.append(piece(
    "mittagsmenue-d1", "D1 Joghurt Pistazien Mousse", "Mittagsmenue", "Dessert", 0.0,
    min_order=1, unit_label="Portion", price_type="person", diet_type="vegetarian",
    description="Joghurt Pistazien Mousse mit Erdbeerpüree durchzogen. Im Mittagsmenü-Preis enthalten (Auswahl).",
))
items.append(piece(
    "mittagsmenue-d2", "D2 Ananas-Trauben-Spieß", "Mittagsmenue", "Dessert", 0.0,
    min_order=1, unit_label="Portion", price_type="person", diet_type="vegan",
    description="Ananas-Trauben-Spieß. Im Mittagsmenü-Preis enthalten (Auswahl).",
))
items.append(piece(
    "mittagsmenue-d3", "D3 Mango Orangen Quarkcreme", "Mittagsmenue", "Dessert", 0.0,
    min_order=1, unit_label="Portion", price_type="person", diet_type="vegetarian",
    description="Mango Orangen Quarkcreme mit Karamellsauce. Im Mittagsmenü-Preis enthalten (Auswahl).",
))
items.append(piece(
    "mittagsmenue-d4", "D4 Kleine Erdbeer Schnitte", "Mittagsmenue", "Dessert", 0.0,
    min_order=1, unit_label="Portion", price_type="person", diet_type="vegetarian",
    description="Kleine Erdbeer Schnitte mit Schoko Mandel Deko. Im Mittagsmenü-Preis enthalten (Auswahl).",
))
items.append(piece(
    "mittagsmenue-s1", "S1 Verschiedene Blattsalate der Saison", "Mittagsmenue", "Salat", 4.50,
    min_order=1, unit_label="Person", price_type="person", diet_type="vegetarian",
    description="Verschiedene Blattsalate der Saison mit Tomaten, Gurken, Croûtons, Champignons und Pesto-Dressing.",
))
items.append(piece(
    "mittagsmenue-s2", "S2 Saisonaler Rohkostsalat", "Mittagsmenue", "Salat", 4.50,
    min_order=1, unit_label="Person", price_type="person", diet_type="vegan",
    description="Saisonaler, bunter Rohkostsalat z.B. von Gurke, Kraut, Möhre, Tomate mit einem Honig-Senf-Dressing.",
))
items.append(piece(
    "mittagsmenue-brot", "Brot", "Mittagsmenue", "Beilage", 1.00,
    min_order=1, unit_label="Portion", price_type="person", diet_type="vegan",
))

with ITEMS_JSON_PATH.open("w", encoding="utf-8") as f:
    json.dump(items, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"Wrote {len(items)} items to {ITEMS_JSON_PATH}")
