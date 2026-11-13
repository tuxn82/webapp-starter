# Webapp Starter til ECIT PaaS

En sikker Node.js-webapp, som du kan bygge videre på med Claude. Opsætningen sker med få klik.

**Det får du:**
- Login med e-mail og adgangskode.
- Brugeradministration med to roller: administrator og bruger.
- PostgreSQL-database.
- HTTPS via Let's Encrypt.
- IP-spærring, hvis du vil have den.

Kode, database og server er sat op efter god praksis fra start. Du kan derfor bruge tiden på din egen funktionalitet.

## Kom i gang

### 1. Lav dit eget repo
Klik på **Use this template → Create a new repository** på GitHub. Vælg **Private**.

### 2. Lav et GitHub-token (kun for private repos)
1. Gå til GitHub → **Settings → Developer settings → Fine-grained tokens → Generate new token**.
2. Under **Repository access**: vælg **Only select repositories** og vælg dit nye repo.
3. Under **Permissions**: sæt **Contents** til **Read-only**.

### 3. Installér på ECIT PaaS
1. Log ind på ECIT PaaS og klik **IMPORT** i topmenuen. Opret **ikke** et environment først, for Import bygger et helt nyt.
2. Vælg **URL** og indsæt adressen nedenfor. Den peger på den offentlige skabelon, så den virker, selvom dit eget repo er privat:

   ```
   https://raw.githubusercontent.com/tuxn82/webapp-starter/main/manifest.jps
   ```

3. Udfyld formularen:

| Felt | Eksempel |
|---|---|
| Appens navn | Kundeportal |
| Git-repo | `https://github.com/dit-navn/dit-repo.git` |
| Branch | `main` |
| GitHub-brugernavn | Dit GitHub-brugernavn (ikke din e-mail) |
| GitHub-token | Tokenet fra trin 2 |
| Administratorens e-mail | `dig@firma.dk` |
| Tilladte IP'er | `203.0.113.10, 198.51.100.0/24` (lad stå tomt for at give adgang for alle) |

   Pas på browserens autoudfyldning. Den sætter ofte din e-mail ind som GitHub-brugernavn og din ECIT-adgangskode ind som token. Ret begge felter.

4. Klik **Install**. Efter ca. 5–10 minutter får du adressen og en midlertidig adgangskode.

### 4. Første login
1. Log ind og vælg din egen adgangskode.
2. Slet derefter variablerne `ADMIN_EMAIL` og `ADMIN_PASSWORD` på App-noden. Det gør du under **Variables** og afslutter med **Apply**.

### 5. Byg videre med Claude
1. Åbn dit repo i [Claude Code](https://claude.com/claude-code), enten på claude.ai/code eller i terminalen.
2. Beskriv, hvad du vil bygge, f.eks. *"Lav en side hvor brugerne kan registrere opgaver med titel, status og deadline"*.
3. Claude læser `CLAUDE.md` og kender dermed både koden og platformen.

Når ændringerne er pushet til `main`, udruller du dem på ECIT. Gå til App-noden → **Deployments**, og vælg dit repo → **Deploy**.

## Indstillinger (miljøvariabler på App-noden)

| Variabel | Betydning |
|---|---|
| `APP_NAME` | Navnet i menulinjen og fanebladet |
| `ALLOWED_IPS` | Tilladte IP'er/CIDR'er, kommasepareret. Er den tom, er der ingen spærring |
| `DATABASE_URL` | Sættes automatisk ved installationen |
| `SESSION_SECRET` | Sættes automatisk ved installationen |
| `SESSION_MAX_AGE_HOURS` | Hvor længe en session holder uden aktivitet. Standard er 8 |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Bruges kun til at oprette den første administrator |

Når du har ændret en variabel, skal du klikke **Apply** og genstarte App-noden.

## Fejlsøgning

- **"Adgang nægtet. Din IP-adresse (…) har ikke adgang":** tilføj den viste IP til `ALLOWED_IPS`.
- **"Forkert e-mail eller adgangskode" ved første login:** tjek stavningen af `ADMIN_EMAIL`. Administratoren oprettes kun én gang, nemlig når der endnu ikke findes nogen brugere. Hvis e-mailen var forkert, kan du tømme tabellen og genstarte appen. Kør `psql -U webadmin -d app -c "DELETE FROM users;"` på databasenoden, og genstart derefter App-noden.
- **Login hopper tilbage til loginsiden:** NGINX sender ikke `X-Forwarded-Proto`.
- **Logs:** brug **Log**-ikonet på App-noden (appen) eller Load Balancer-noden (NGINX).

## Lokal udvikling

```bash
npm install
DATABASE_URL=postgresql://localhost/app ADMIN_EMAIL=admin@test.dk ADMIN_PASSWORD='StartKode-12345' npm start
```

Åbn derefter http://localhost:8080.

## Validering af manifestet (for vedligeholdere)

`manifest.jps` er testet mod ECIT's platform (Virtuozzo 8.15) den 13. nov. 2026. Status:
- ✅ Node-typerne `nginx`, `nodejs` og `postgresql` oprettes (testet 13. nov. 2026).
- ✅ Git-udrulning sker via `env.vcs.CreateProject` + `env.vcs.Update`, også fra et privat repo. (`deploy` kan kun arkiver og fejler med "invalid parameter [fileUrl]".)
- ✅ Git-udrulning, databaseoprettelse og genererede adgangskoder virker (testet 13. nov. 2026).
- ✅ Let's Encrypt giver et rigtigt certifikat, når `customDomains` er sat til environmentets domæne. Med et tomt felt udstedes der et **STAGING-certifikat**, som browsere ikke stoler på. Det er bekræftet ved at sætte domænet manuelt; en helt ny installation med den rettede version mangler.
- Let's Encrypt har en grænse for, hvor mange certifikater et domæne må få pr. uge. Alle environments deler `paas.ecit.com`, så det skal afklares med ECIT, hvis der kommer mange installationer.
