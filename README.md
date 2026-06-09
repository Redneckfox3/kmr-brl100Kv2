# Koudemiddel Registratie (KMR) Web App - BRL 100 v2

Een moderne, responsive en gebruiksvriendelijke webapplicatie voor koudemiddelregistratie en het opstellen van f-gassen jaarbalansen conform de Nederlandse richtlijn **BRL 100 versie 2.0**.

De applicatie draait direct in de browser met een slimme, lokale database (**LocalStorage**), waardoor hij direct out-of-the-box functioneert. Daarnaast is er een ingebouwde optie om via het instellingenscherm in de app verbinding te maken met een gratis online cloud database (**Firebase Firestore**) voor persistente hosting en toegang vanaf alle apparaten (mobiel, tablet, pc).

---

## Functionaliteiten

1. **Dashboard:** Actueel overzicht van de totale cilindervoorraad, het aantal registraties op installatieniveau en de totale CO₂-equivalenten. Tevens een overzicht van de voorraadniveaus per koudemiddel en de meest recente registraties.
2. **Installatie Registraties:** Registreer en bewerk handelingen op installatieniveau met automatische berekening van de CO₂-equivalenten (`hoeveelheid kg * GWP / 1000`) en automatische bijwerking van uw cilindervoorraad.
   * *Mutaties:* Toevoeging, Afrekening, Terugwinning en Afvoer.
   * *Redenen conform BRL100:* Onderhoud, Nieuwbouw, Retrofit, Lekkage herstel en Buitengebruikstelling.
3. **Koudemiddel Jaarbalans:** Een jaarlijks overzicht per koudemiddel met de beginstand (1 januari) en eindstand (31 december).
   * **Aanpasbaar:** De beginstanden op 1 januari zijn direct in de tabel aanpasbaar; de eindstanden worden live herberekend.
   * **PDF Export:** Exporteer de jaarbalans met één klik naar een officieel PDF-rapport, klaar voor de keuringsinstantie.
4. **Instellingen & Koudemiddelenbeheer:**
   * **Koudemiddelen toevoegen:** Voeg eenvoudig nieuwe koudemiddelen toe inclusief hun GWP (Global Warming Potential) en startvoorraad. R32, R410A en R407C zijn standaard al voor u voorgevuld!
   * **Cloud Database (Firebase) verbinding:** Configureer eenvoudig uw eigen Firebase-credentials via de app-UI om direct over te schakelen naar een gedeelde cloud database (geen code-aanpassingen nodig!).

---

## Installatie & Lokaal Starten

Zorg ervoor dat [Node.js](https://nodejs.org/) op uw computer is geïnstalleerd. Open een terminal (PowerShell of Command Prompt) in de projectmap `D:\AI\KMR\` en voer de volgende stappen uit:

### 1. Project starten in ontwikkelmodus (Development)
Sla de dependencies op en start de lokale server:
```bash
# Start de applicatie in de browser (opent automatisch op http://localhost:3000)
npm run dev
```

### 2. Productieversie bouwen (Production Build)
Om de applicatie te compileren tot een geoptimaliseerde, supersnelle statische website:
```bash
npm run build
```
De gegenereerde bestanden staan in de map `dist/` en kunnen eenvoudig op elke webhoster of lokaal worden gedraaid.

---

## Database Configureren: Van Lokaal naar Cloud (Hosting)

Standaard slaat de app alle data veilig op in de **LocalStorage** van uw browser. Dit werkt direct en vereist geen setup.

Wilt u de applicatie benaderen vanaf meerdere apparaten (bijv. mobiel en tablet op locatie)? Volg dan de eenvoudige stappen in het **Instellingen-scherm** van de app om een gratis **Google Firebase Firestore** database te koppelen:

1. Ga naar de [Firebase Console](https://console.firebase.google.com/) en maak een gratis project aan.
2. Schakel **Cloud Firestore** in en start in testmodus.
3. Registreer een **Web App** in uw Firebase-project.
4. Kopieer de API-sleutels (`apiKey`, `projectId`, `appId`) en plak deze in het **Instellingen-scherm** in de webapp.
5. Klik op **Cloud database verbinden**. De app start opnieuw op en is nu live gesynchroniseerd met uw cloud-omgeving!

---

## Richtlijn & Voorbeelden
* **BRL100 v2.0:** Dit project is volledig afgestemd op de eisen in het in de werkmap aanwezige document `BRL100-versie-2.0-6-juni-2019.pdf`.
* **Voorbeeldregistratie:** De berekeningen en opzet van de jaarbalans en de pdf-export zijn geënt op het voorbeeldbestand `koudemiddelregistratie 2023_definitief.xls`.
