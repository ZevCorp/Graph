# Registered Workflows

## wf_1778273805725

- Purpose: **Workflow Summary – From Landing Page to Saved Prescription**

1. **Landing & Patient Intake (Page 1 – `index.html`)**
   - Opens the **Graph EMR Trainer** home page (`http://localhost:3000/index.html`).
   - Clicks and fills **Medical Record Number** → `dcsdcsdcdc`.
   - Enters **First name**, **Last name**, **Date of birth** (`2026‑05‑07` / `2026‑05‑14`), **Mobile phone**, **Insurer**, and **Chief complaint** (`sdcsdcsdc`).
   - Fills basic **vitals** (Temperature `cdc`, Heart rate `csdc`, Blood pressure `cdscsd`, SpO₂ `cads`).

2. **Save & Navigate to Chart**
   - Clicks **Save Patient** (`intake‑save‑patient`) then **Open Chart** (`intake‑open‑chart`).
   - Navigates to the **EMR Anamnesis** page (`page1.html`).

3. **Anamnesis – History Collection (Page 1 → Page 2)**
   - Enters **Days with symptoms** (`csdc`), **History of present illness** (`csdcsdc`), **Relevant medical history** (`sdcsdcsdc`), **Allergies** (`sdcsdcsdcc`), and **Review of systems** (`dscsdcsdc`).
   - Adds **Physical exam findings** (`sdcsdcd`).
   - Saves the note (`anamnesis‑save‑note`) and requests labs (`anamnesis‑request‑labs`).
   - Clicks a link to proceed to **Diagnosis & Prescription** (`page2.html`).

4. **Diagnosis & Prescription (Page 2 – `page2.html`)**
   - Records **Primary diagnosis** (`dcsdc`), **ICD‑10 code** (`sdcsd`), and **Clinical impression** (`cidc`).
   - Prescribes medication: name (`cdsc`), dose (`cdsc`), frequency (`csdcds`), duration (`cdscsd`), and **Patient instructions** (`csdcsdcdc`).
   - Documents **Additional orders** (`sdcsdcsd`) and **Follow‑up plan** (`csdcsdc`).
   - Saves the assessment note (`assessment‑sign‑note`) and generates the prescription (`assessment‑generate‑rx`).

**Overall Flow:**  
User starts at the index page, completes a multi‑field patient intake form, saves the record, moves into an anamnesis module to capture detailed history and exam data, saves that note, then proceeds to a diagnosis/prescription module where clinical conclusions and medication orders are entered and finally saved. The navigation moves sequentially from `index.html` → `page1.html` → `page2.html`, with each step consisting of a click‑to‑open a field followed by an input action, ending with save/generate actions.
- Status: done
- CLI: `node index.js "run wf_1778273805725" --input_3="..." --input_4="..." --input_5="..." --input_7="..." --input_8="..." --input_9="..." --input_11="..." --input_13="..." --input_15="..." --input_17="..." --input_19="..." --input_21="..." --input_27="..." --input_29="..." --input_31="..." --input_33="..." --input_35="..." --input_37="..." --input_39="..." --input_45="..." --input_47="..." --input_49="..." --input_51="..." --input_53="..." --input_55="..." --input_57="..." --input_59="..." --input_61="..." --input_63="..."`

### Variables
- `input_3`: field="Medical record number" Value for Medical record number (default: `dcsdcsdcdc`)
- `input_4`: field="First name" Value for First name (default: `cdsc`)
- `input_5`: field="Last name" Value for Last name (default: `sdcsdc`)
- `input_7`: field="Date of birth" Value for Date of birth (default: `2026-05-07`)
- `input_8`: field="Date of birth" Value for Date of birth (default: `2026-05-14`)
- `input_9`: field="Mobile phone" Value for Mobile phone (default: `csdcsd`)
- `input_11`: field="Insurer / payer" Value for Insurer / payer (default: `cdscsdc`)
- `input_13`: field="Chief complaint" Value for Chief complaint (default: `sdcsdcsdc`)
- `input_15`: field="Temperature" Value for Temperature (default: `cdc`)
- `input_17`: field="Heart rate" Value for Heart rate (default: `csdc`)
- `input_19`: field="Blood pressure" Value for Blood pressure (default: `cdscsd`)
- `input_21`: field="SpO2" Value for SpO2 (default: `cads`)
- `input_27`: field="Days with symptoms" Value for Days with symptoms (default: `csdc`)
- `input_29`: field="History of present illness" Value for History of present illness (default: `csdcsdc`)
- `input_31`: field="Relevant medical history" Value for Relevant medical history (default: `sdcsdcsdc`)
- `input_33`: field="Allergies" Value for Allergies (default: `sdcsdcsdcc`)
- `input_35`: field="Review of systems" Value for Review of systems (default: `dscsdcsdc`)
- `input_37`: field="General appearance" Value for General appearance (default: `sdcsdc`)
- `input_39`: field="Physical exam findings" Value for Physical exam findings (default: `sdcsdcd`)
- `input_45`: field="Primary diagnosis" Value for Primary diagnosis (default: `dcsdc`)
- `input_47`: field="ICD-10 code" Value for ICD-10 code (default: `sdcsd`)
- `input_49`: field="Clinical impression" Value for Clinical impression (default: `cidc`)
- `input_51`: field="Medication" Value for Medication (default: `cdsc`)
- `input_53`: field="Dose" Value for Dose (default: `cdsc`)
- `input_55`: field="Frequency" Value for Frequency (default: `csdcds`)
- `input_57`: field="Duration" Value for Duration (default: `cdscsd`)
- `input_59`: field="Patient instructions" Value for Patient instructions (default: `csdcsdcdc`)
- `input_61`: field="Additional orders" Value for Additional orders (default: `sdcsdcsd`)
- `input_63`: field="Follow-up plan" Value for Follow-up plan (default: `csdcsdc`)

### Steps
- 1. NAVIGATION document | label="Graph EMR Trainer" | url=http://localhost:3000/index.html
- 2. CLICK [data-testid="intake-patient-id"] | label="Medical record number" | control=text | url=http://localhost:3000/index.html
- 3. INPUT [data-testid="intake-patient-id"] | value="dcsdcsdcdc" | label="Medical record number" | control=text | url=http://localhost:3000/index.html
- 4. INPUT [data-testid="intake-first-name"] | value="cdsc" | label="First name" | control=text | url=http://localhost:3000/index.html
- 5. INPUT [data-testid="intake-last-name"] | value="sdcsdc" | label="Last name" | control=text | url=http://localhost:3000/index.html
- 6. CLICK [data-testid="intake-dob"] | label="Date of birth" | control=date | url=http://localhost:3000/index.html
- 7. INPUT [data-testid="intake-dob"] | value="2026-05-07" | label="Date of birth" | control=date | url=http://localhost:3000/index.html
- 8. INPUT [data-testid="intake-dob"] | value="2026-05-14" | label="Date of birth" | control=date | url=http://localhost:3000/index.html
- 9. INPUT [data-testid="intake-phone"] | value="csdcsd" | label="Mobile phone" | control=text | url=http://localhost:3000/index.html
- 10. CLICK [data-testid="intake-insurance"] | label="Insurer / payer" | control=text | url=http://localhost:3000/index.html
- 11. INPUT [data-testid="intake-insurance"] | value="cdscsdc" | label="Insurer / payer" | control=text | url=http://localhost:3000/index.html
- 12. CLICK [data-testid="intake-chief-complaint"] | label="Chief complaint" | control=textarea | url=http://localhost:3000/index.html
- 13. INPUT [data-testid="intake-chief-complaint"] | value="sdcsdcsdc" | label="Chief complaint" | control=textarea | url=http://localhost:3000/index.html
- 14. CLICK [data-testid="triage-temperature"] | label="Temperature" | control=text | url=http://localhost:3000/index.html
- 15. INPUT [data-testid="triage-temperature"] | value="cdc" | label="Temperature" | control=text | url=http://localhost:3000/index.html
- 16. CLICK [data-testid="triage-heart-rate"] | label="Heart rate" | control=text | url=http://localhost:3000/index.html
- 17. INPUT [data-testid="triage-heart-rate"] | value="csdc" | label="Heart rate" | control=text | url=http://localhost:3000/index.html
- 18. CLICK [data-testid="triage-blood-pressure"] | label="Blood pressure" | control=text | url=http://localhost:3000/index.html
- 19. INPUT [data-testid="triage-blood-pressure"] | value="cdscsd" | label="Blood pressure" | control=text | url=http://localhost:3000/index.html
- 20. CLICK [data-testid="triage-oxygen"] | label="SpO2" | control=text | url=http://localhost:3000/index.html
- 21. INPUT [data-testid="triage-oxygen"] | value="cads" | label="SpO2" | control=text | url=http://localhost:3000/index.html
- 22. CLICK [data-testid="intake-save-patient"] | label="intake-save-patient" | control=button | url=http://localhost:3000/index.html
- 23. CLICK [data-testid="intake-open-chart"] | label="intake-open-chart" | control=button | url=http://localhost:3000/index.html
- 24. CLICK a[href="page1.html"] | control=a | url=http://localhost:3000/index.html
- 25. NAVIGATION document | label="EMR Anamnesis" | url=http://localhost:3000/page1.html
- 26. CLICK [data-testid="anamnesis-symptom-days"] | label="Days with symptoms" | control=text | url=http://localhost:3000/page1.html
- 27. INPUT [data-testid="anamnesis-symptom-days"] | value="csdc" | label="Days with symptoms" | control=text | url=http://localhost:3000/page1.html
- 28. CLICK [data-testid="anamnesis-history-illness"] | label="History of present illness" | control=textarea | url=http://localhost:3000/page1.html
- 29. INPUT [data-testid="anamnesis-history-illness"] | value="csdcsdc" | label="History of present illness" | control=textarea | url=http://localhost:3000/page1.html
- 30. CLICK [data-testid="anamnesis-medical-history"] | label="Relevant medical history" | control=textarea | url=http://localhost:3000/page1.html
- 31. INPUT [data-testid="anamnesis-medical-history"] | value="sdcsdcsdc" | label="Relevant medical history" | control=textarea | url=http://localhost:3000/page1.html
- 32. CLICK [data-testid="anamnesis-allergies"] | label="Allergies" | control=textarea | url=http://localhost:3000/page1.html
- 33. INPUT [data-testid="anamnesis-allergies"] | value="sdcsdcsdcc" | label="Allergies" | control=textarea | url=http://localhost:3000/page1.html
- 34. CLICK [data-testid="anamnesis-review-systems"] | label="Review of systems" | control=textarea | url=http://localhost:3000/page1.html
- 35. INPUT [data-testid="anamnesis-review-systems"] | value="dscsdcsdc" | label="Review of systems" | control=textarea | url=http://localhost:3000/page1.html
- 36. CLICK [data-testid="exam-general-appearance"] | label="General appearance" | control=textarea | url=http://localhost:3000/page1.html
- 37. INPUT [data-testid="exam-general-appearance"] | value="sdcsdc" | label="General appearance" | control=textarea | url=http://localhost:3000/page1.html
- 38. CLICK [data-testid="exam-findings"] | label="Physical exam findings" | control=textarea | url=http://localhost:3000/page1.html
- 39. INPUT [data-testid="exam-findings"] | value="sdcsdcd" | label="Physical exam findings" | control=textarea | url=http://localhost:3000/page1.html
- 40. CLICK [data-testid="anamnesis-save-note"] | label="anamnesis-save-note" | control=button | url=http://localhost:3000/page1.html
- 41. CLICK [data-testid="anamnesis-request-labs"] | label="anamnesis-request-labs" | control=button | url=http://localhost:3000/page1.html
- 42. CLICK a[href="page2.html"] | control=a | url=http://localhost:3000/page1.html
- 43. NAVIGATION document | label="EMR Diagnosis and Prescription" | url=http://localhost:3000/page2.html
- 44. CLICK [data-testid="assessment-primary-diagnosis"] | label="Primary diagnosis" | control=text | url=http://localhost:3000/page2.html
- 45. INPUT [data-testid="assessment-primary-diagnosis"] | value="dcsdc" | label="Primary diagnosis" | control=text | url=http://localhost:3000/page2.html
- 46. CLICK [data-testid="assessment-icd10"] | label="ICD-10 code" | control=text | url=http://localhost:3000/page2.html
- 47. INPUT [data-testid="assessment-icd10"] | value="sdcsd" | label="ICD-10 code" | control=text | url=http://localhost:3000/page2.html
- 48. CLICK [data-testid="assessment-clinical-impression"] | label="Clinical impression" | control=textarea | url=http://localhost:3000/page2.html
- 49. INPUT [data-testid="assessment-clinical-impression"] | value="cidc" | label="Clinical impression" | control=textarea | url=http://localhost:3000/page2.html
- 50. CLICK [data-testid="rx-medication-name"] | label="Medication" | control=text | url=http://localhost:3000/page2.html
- 51. INPUT [data-testid="rx-medication-name"] | value="cdsc" | label="Medication" | control=text | url=http://localhost:3000/page2.html
- 52. CLICK [data-testid="rx-medication-dose"] | label="Dose" | control=text | url=http://localhost:3000/page2.html
- 53. INPUT [data-testid="rx-medication-dose"] | value="cdsc" | label="Dose" | control=text | url=http://localhost:3000/page2.html
- 54. CLICK [data-testid="rx-medication-frequency"] | label="Frequency" | control=text | url=http://localhost:3000/page2.html
- 55. INPUT [data-testid="rx-medication-frequency"] | value="csdcds" | label="Frequency" | control=text | url=http://localhost:3000/page2.html
- 56. CLICK [data-testid="rx-medication-duration"] | label="Duration" | control=text | url=http://localhost:3000/page2.html
- 57. INPUT [data-testid="rx-medication-duration"] | value="cdscsd" | label="Duration" | control=text | url=http://localhost:3000/page2.html
- 58. CLICK [data-testid="rx-instructions"] | label="Patient instructions" | control=textarea | url=http://localhost:3000/page2.html
- 59. INPUT [data-testid="rx-instructions"] | value="csdcsdcdc" | label="Patient instructions" | control=textarea | url=http://localhost:3000/page2.html
- 60. CLICK [data-testid="plan-orders"] | label="Additional orders" | control=textarea | url=http://localhost:3000/page2.html
- 61. INPUT [data-testid="plan-orders"] | value="sdcsdcsd" | label="Additional orders" | control=textarea | url=http://localhost:3000/page2.html
- 62. CLICK [data-testid="plan-follow-up"] | label="Follow-up plan" | control=textarea | url=http://localhost:3000/page2.html
- 63. INPUT [data-testid="plan-follow-up"] | value="csdcsdc" | label="Follow-up plan" | control=textarea | url=http://localhost:3000/page2.html
- 64. CLICK [data-testid="assessment-sign-note"] | label="assessment-sign-note" | control=button | url=http://localhost:3000/page2.html
- 65. CLICK [data-testid="assessment-generate-rx"] | label="assessment-generate-rx" | control=button | url=http://localhost:3000/page2.html
