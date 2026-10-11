#!/usr/bin/env python3
"""
Contrôle croisé de nos cartes JP et TC avec l'API TCGdex (gratuite, open source).

LECTURE SEULE : ce script n'écrit jamais en base. Il lit un export CSV de
l'échantillon (echantillon-export.sql) et produit un rapport d'écarts.

Usage (Python 3.9+, aucune dépendance) :
    python3 controle_tcgdex.py echantillon.csv
Résultats dans ./output/ :
    rapport-controle-tcgdex.csv   une ligne par carte contrôlée
    synthese-controle-tcgdex.txt  chiffres par langue et par type d'écart
Un cache des réponses est gardé dans ./cache/ (relancer ne refait pas les appels).
"""
import csv
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from collections import Counter, defaultdict

API = "https://api.tcgdex.net/v2"
# Langue TCGdex pour chaque langue de notre base
LANG_TCGDEX = {"JP": "ja", "TC": "zh-tw"}
CACHE_DIR = "cache"
OUT_DIR = "output"
PAUSE_S = 0.4  # politesse envers l'API

# Raretés TCGdex (libellés anglais) -> nos codes. Un libellé absent de cette
# table est signalé « non_mappee » : il faut l'ajouter après vérification.
RARETE_TCGDEX = {
    "common": "common", "uncommon": "uncommon", "rare": "rare",
    "rare holo": "holo_rare", "double rare": "double_rare", "triple rare": "triple_rare",
    "ultra rare": "ultra_rare", "illustration rare": "illustration_rare",
    "special illustration rare": "special_illustration_rare", "hyper rare": "hyper_rare",
    "secret rare": "secret_rare", "shiny rare": "shiny_rare",
    "shiny ultra rare": "shiny_ultra_rare", "promo": "promo", "none": "none",
    "character rare": "character_rare", "character super rare": "character_super_rare",
    "mega hyper rare": "mega_hyper_rare", "radiant rare": "radiant_rare",
    "amazing rare": "amazing_rare", "ace spec rare": "ace_spec",
    "legend": "legend", "prism star": "prism_star",
}


def normaliser_nom(texte):
    if not texte:
        return ""
    t = unicodedata.normalize("NFKC", str(texte)).lower()
    t = "".join(ch for ch in unicodedata.normalize("NFD", t) if unicodedata.category(ch) != "Mn")
    return re.sub(r"[\s\W_]+", "", t)


def numero_int(texte):
    m = re.search(r"\d+", str(texte or ""))
    return int(m.group()) if m else None


def requete_json(url, cache_key):
    """GET JSON avec cache disque. Renvoie None si introuvable ou erreur."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    chemin = os.path.join(CACHE_DIR, re.sub(r"[^A-Za-z0-9_.-]", "_", cache_key) + ".json")
    if os.path.exists(chemin):
        with open(chemin, encoding="utf-8") as fh:
            return json.load(fh)
    req = urllib.request.Request(url, headers={"User-Agent": "pkmn-collection-controle/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as rep:
            data = json.loads(rep.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        data = {"_erreur_http": e.code}
    except Exception as e:  # réseau, JSON invalide…
        print(f"  ! erreur {url} : {e}", file=sys.stderr)
        return None
    with open(chemin, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False)
    time.sleep(PAUSE_S)
    return data


def charger_set(lang_tcg, set_code):
    """Liste des cartes d'un set TCGdex, avec essai de deux graphies du code."""
    for code in (set_code, set_code.lower(), set_code.upper()):
        data = requete_json(f"{API}/{lang_tcg}/sets/{code}", f"set_{lang_tcg}_{code}")
        if data and "cards" in data:
            return code, data["cards"]
    return None, None


def charger_carte(lang_tcg, card_id):
    return requete_json(f"{API}/{lang_tcg}/cards/{card_id}", f"carte_{lang_tcg}_{card_id}")


def comparer(ligne, carte_liste_match, carte_detail):
    """Compare une carte de notre base avec la fiche TCGdex. Renvoie un dict."""
    res = {}
    res["nom_tcgdex"] = carte_detail.get("name", "") if carte_detail else ""
    res["rarete_tcgdex"] = (carte_detail or {}).get("rarity", "") or ""
    res["illustrateur_tcgdex"] = (carte_detail or {}).get("illustrator", "") or ""

    res["nom_ok"] = normaliser_nom(ligne["nom"]) == normaliser_nom(res["nom_tcgdex"])
    res["pv_ok"] = (
        str(ligne.get("pv") or "") == str((carte_detail or {}).get("hp") or "")
        if (ligne.get("pv") or (carte_detail or {}).get("hp")) else None
    )
    ill_base = normaliser_nom(ligne.get("illustrateur"))
    ill_tcg = normaliser_nom(res["illustrateur_tcgdex"])
    res["illustrateur_ok"] = None if not (ill_base and ill_tcg) else ill_base == ill_tcg

    rar_tcg = res["rarete_tcgdex"].strip().lower()
    code_tcg = RARETE_TCGDEX.get(rar_tcg)
    if not rar_tcg:
        res["rarete_statut"] = "absente_tcgdex"
    elif code_tcg is None:
        res["rarete_statut"] = "non_mappee"
    elif not ligne.get("code_rarete"):
        res["rarete_statut"] = "absente_chez_nous"
    elif code_tcg == ligne["code_rarete"]:
        res["rarete_statut"] = "identique"
    else:
        res["rarete_statut"] = "ecart"
    res["code_rarete_tcgdex"] = code_tcg or ""
    return res


def main(fichier_csv):
    if not os.path.exists(fichier_csv):
        print(f"Fichier introuvable : {fichier_csv}")
        print("Vérifie que le CSV exporté du SQL Editor est dans ce dossier, sous ce nom exact.")
        print("Dossier courant : " + os.getcwd())
        sys.exit(1)
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(fichier_csv, encoding="utf-8-sig", newline="") as fh:
        # L'export du SQL Editor écrit les valeurs vides sous la forme « null » : on les traite comme vides
        lignes = [{k: ("" if (v is None or str(v).strip().lower() == "null") else v)
                   for k, v in ligne.items()} for ligne in csv.DictReader(fh)]
    print(f"{len(lignes)} cartes à contrôler")

    cache_sets = {}
    rapport = []
    stats = defaultdict(Counter)

    for ligne in lignes:
        langue = ligne["langue"]
        lang_tcg = LANG_TCGDEX.get(langue)
        if not lang_tcg:
            continue
        cle_set = (lang_tcg, ligne["set_code"])
        if cle_set not in cache_sets:
            cache_sets[cle_set] = charger_set(lang_tcg, ligne["set_code"])
        code_tcg, cartes = cache_sets[cle_set]

        base = {"langue": langue, "set_code": ligne["set_code"], "numero": ligne["numero"],
                "nom": ligne["nom"], "code_rarete": ligne.get("code_rarete", ""),
                "rarete_brute": ligne.get("rarete_brute", ""), "illustrateur": ligne.get("illustrateur", ""),
                "source": ligne.get("source", "")}

        if cartes is None:
            statut = "set_introuvable_tcgdex"
            stats[langue][statut] += 1
            rapport.append({**base, "statut": statut})
            continue

        # Trouver la carte par numéro (localId), puis par nom si plusieurs
        n = numero_int(ligne["numero"])
        candidats = [c for c in cartes if numero_int(c.get("localId")) == n]
        if not candidats:
            statut = "numero_absent_tcgdex"
            stats[langue][statut] += 1
            rapport.append({**base, "statut": statut})
            continue
        if len(candidats) > 1:
            meme_nom = [c for c in candidats if normaliser_nom(c.get("name")) == normaliser_nom(ligne["nom"])]
            candidats = meme_nom or candidats
        carte_tc = candidats[0]
        detail = charger_carte(lang_tcg, carte_tc["id"])
        if not detail or "_erreur_http" in detail:
            statut = "fiche_inaccessible"
            stats[langue][statut] += 1
            rapport.append({**base, "statut": statut})
            continue

        cmp_ = comparer(ligne, candidats, detail)
        statut = "controle"
        stats[langue][statut] += 1
        stats[langue]["nom_ok" if cmp_["nom_ok"] else "nom_ecart"] += 1
        if cmp_["illustrateur_ok"] is not None:
            stats[langue]["illustrateur_ok" if cmp_["illustrateur_ok"] else "illustrateur_ecart"] += 1
        stats[langue]["rarete_" + cmp_["rarete_statut"]] += 1
        rapport.append({**base, "statut": statut, **cmp_})

    # Rapport détaillé
    colonnes = ["langue", "set_code", "numero", "nom", "nom_tcgdex", "nom_ok", "rarete_brute",
                "code_rarete", "rarete_tcgdex", "code_rarete_tcgdex", "rarete_statut",
                "illustrateur", "illustrateur_tcgdex", "illustrateur_ok", "pv_ok", "source", "statut"]
    with open(os.path.join(OUT_DIR, "rapport-controle-tcgdex.csv"), "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=colonnes, extrasaction="ignore")
        w.writeheader()
        for r in rapport:
            w.writerow(r)

    # Synthèse
    lignes_synthese = []
    for langue in sorted(stats):
        lignes_synthese.append(f"== {langue} ==")
        for cle, n in sorted(stats[langue].items()):
            lignes_synthese.append(f"  {cle:30s} {n}")
        lignes_synthese.append("")
    texte = "\n".join(lignes_synthese)
    with open(os.path.join(OUT_DIR, "synthese-controle-tcgdex.txt"), "w", encoding="utf-8") as fh:
        fh.write(texte)
    print(texte)
    print(f"Rapport : {OUT_DIR}/rapport-controle-tcgdex.csv")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage : python3 controle_tcgdex.py echantillon.csv")
        sys.exit(1)
    main(sys.argv[1])
