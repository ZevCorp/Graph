# Registered Workflows

## wf_1778248237538

- Purpose: **Navigation / Data‑Entry Workflow – Summary**

1. **Patient Registration (index.html)**
   - Click **MRN‑2026‑00124** → type *csdcscdscd* into the MRN field.  
   - Fill first‑name *csdcsdc*, last‑name *dcscs*, DOB *2026‑05‑09*, phone *cdscsdc*.  
   - Enter insurance *ccdcd*.  
   - In the chief‑complaint textarea, enter *csdcsdc*.  
   - Click to set temperature *38.2* → enter *cads*.  
   - Click to set heart‑rate *96* → enter *cdsc*.  
   - Click to set blood‑pressure *118/74* → enter *cdsc*.  
   - Click to set oxygen *98* → enter *cdsc*.  
   - Click **Save Registration** → then **Open Clinical Chart**.

2. **Anamnesis (page1.html)**
   - Click **Anamnesis** → go to *page1.html*.  
   - Enter symptom duration *3* (value *cds*).  
   - In the illness history textarea, type *cdscsdcdcc*.  
   - In the medical‑history textarea, type *dcsdcd*.  
   - In the allergies textarea, type *cidccsdc*.  
   - In the review‑of‑systems textarea, type *ccdcdc*.  
   - Click **Save Note**, then **Request Labs**.

3. **Diagnosis & Prescription (page2.html)**
   - Click **Diagnosis & Rx** → navigate to *page2.html*.  
   - Enter primary diagnosis *sdcsdc* (selected ICD‑10 *dcsdc*).  
   - Provide clinical impression *idc*.  
   - Add medication: name *cidc*, dose *sdcsdc*, frequency *csdcd*, duration *csdcsdc*.  
   - Fill instructions textarea with *dcsdcsdcd*.  
   - Add plan notes *csdcsdc* and follow‑up note *sdcsdcc*.  
   - Click **Sign Clinical Note**, then **Generate Prescription**, and finally **btn-record‑toggle** to complete the record.

**Overall Flow:**  
Start at the registration page, complete all mandatory fields, save, move into the Anamnesis section to capture history and symptoms, save, proceed to Diagnosis & Rx to document assessment, medication, and plan, then finalize by signing the note and generating the prescription. Each step follows a strict numeric order, clicking specific UI elements to progress through the EMR trainer workflow.
- Status: done
- CLI: `node index.js "run wf_1778248237538" --input_3="..." --input_4="..." --input_5="..." --input_7="..." --input_9="..." --input_11="..." --input_13="..." --input_15="..." --input_17="..." --input_19="..." --input_21="..." --input_27="..." --input_29="..." --input_31="..." --input_33="..." --input_35="..." --input_37="..." --input_39="..." --input_45="..." --input_47="..." --input_49="..." --input_51="..." --input_53="..." --input_55="..." --input_57="..." --input_59="..." --input_61="..." --input_63="..."`

### Variables
- `input_3`: Value for csdcscdscd (default: `csdcscdscd`)
- `input_4`: Value for csdcsdc (default: `csdcsdc`)
- `input_5`: Value for dcscs (default: `dcscs`)
- `input_7`: Value for 2026-05-09 (default: `2026-05-09`)
- `input_9`: Value for cdscsdc (default: `cdscsdc`)
- `input_11`: Value for ccdcd (default: `ccdcd`)
- `input_13`: Value for csdcsdc (default: `csdcsdc`)
- `input_15`: Value for cads (default: `cads`)
- `input_17`: Value for cdsc (default: `cdsc`)
- `input_19`: Value for cdsc (default: `cdsc`)
- `input_21`: Value for cdsc (default: `cdsc`)
- `input_27`: Value for cds (default: `cds`)
- `input_29`: Value for cdscsdcdcc (default: `cdscsdcdcc`)
- `input_31`: Value for dcsdcd (default: `dcsdcd`)
- `input_33`: Value for cidccsdc (default: `cidccsdc`)
- `input_35`: Value for ccdcdc (default: `ccdcdc`)
- `input_37`: Value for csdcd (default: `csdcd`)
- `input_39`: Value for cdccd (default: `cdccd`)
- `input_45`: Value for sdcsdc (default: `sdcsdc`)
- `input_47`: Value for dcsdc (default: `dcsdc`)
- `input_49`: Value for idc (default: `idc`)
- `input_51`: Value for cidc (default: `cidc`)
- `input_53`: Value for sdcsdc (default: `sdcsdc`)
- `input_55`: Value for csdcd (default: `csdcd`)
- `input_57`: Value for csdcsdc (default: `csdcsdc`)
- `input_59`: Value for dcsdcsdcd (default: `dcsdcsdcd`)
- `input_61`: Value for csdcsdc (default: `csdcsdc`)
- `input_63`: Value for sdcsdcc (default: `sdcsdcc`)

### Steps
- 1. NAVIGATION document | url=http://localhost:3000/index.html
- 2. CLICK [data-testid="intake-patient-id"] | url=http://localhost:3000/index.html
- 3. INPUT [data-testid="intake-patient-id"] | value="csdcscdscd" | url=http://localhost:3000/index.html
- 4. INPUT [data-testid="intake-first-name"] | value="csdcsdc" | url=http://localhost:3000/index.html
- 5. INPUT [data-testid="intake-last-name"] | value="dcscs" | url=http://localhost:3000/index.html
- 6. CLICK [data-testid="intake-dob"] | url=http://localhost:3000/index.html
- 7. INPUT [data-testid="intake-dob"] | value="2026-05-09" | url=http://localhost:3000/index.html
- 8. CLICK [data-testid="intake-phone"] | url=http://localhost:3000/index.html
- 9. INPUT [data-testid="intake-phone"] | value="cdscsdc" | url=http://localhost:3000/index.html
- 10. CLICK [data-testid="intake-insurance"] | url=http://localhost:3000/index.html
- 11. INPUT [data-testid="intake-insurance"] | value="ccdcd" | url=http://localhost:3000/index.html
- 12. CLICK [data-testid="intake-chief-complaint"] | url=http://localhost:3000/index.html
- 13. INPUT [data-testid="intake-chief-complaint"] | value="csdcsdc" | url=http://localhost:3000/index.html
- 14. CLICK [data-testid="triage-temperature"] | url=http://localhost:3000/index.html
- 15. INPUT [data-testid="triage-temperature"] | value="cads" | url=http://localhost:3000/index.html
- 16. CLICK [data-testid="triage-heart-rate"] | url=http://localhost:3000/index.html
- 17. INPUT [data-testid="triage-heart-rate"] | value="cdsc" | url=http://localhost:3000/index.html
- 18. CLICK [data-testid="triage-blood-pressure"] | url=http://localhost:3000/index.html
- 19. INPUT [data-testid="triage-blood-pressure"] | value="cdsc" | url=http://localhost:3000/index.html
- 20. CLICK [data-testid="triage-oxygen"] | url=http://localhost:3000/index.html
- 21. INPUT [data-testid="triage-oxygen"] | value="cdsc" | url=http://localhost:3000/index.html
- 22. CLICK [data-testid="intake-save-patient"] | url=http://localhost:3000/index.html
- 23. CLICK [data-testid="intake-open-chart"] | url=http://localhost:3000/index.html
- 24. CLICK a[href="page1.html"] | url=http://localhost:3000/index.html
- 25. NAVIGATION document | url=http://localhost:3000/page1.html
- 26. CLICK [data-testid="anamnesis-symptom-days"] | url=http://localhost:3000/page1.html
- 27. INPUT [data-testid="anamnesis-symptom-days"] | value="cds" | url=http://localhost:3000/page1.html
- 28. CLICK [data-testid="anamnesis-history-illness"] | url=http://localhost:3000/page1.html
- 29. INPUT [data-testid="anamnesis-history-illness"] | value="cdscsdcdcc" | url=http://localhost:3000/page1.html
- 30. CLICK [data-testid="anamnesis-medical-history"] | url=http://localhost:3000/page1.html
- 31. INPUT [data-testid="anamnesis-medical-history"] | value="dcsdcd" | url=http://localhost:3000/page1.html
- 32. CLICK [data-testid="anamnesis-allergies"] | url=http://localhost:3000/page1.html
- 33. INPUT [data-testid="anamnesis-allergies"] | value="cidccsdc" | url=http://localhost:3000/page1.html
- 34. CLICK [data-testid="anamnesis-review-systems"] | url=http://localhost:3000/page1.html
- 35. INPUT [data-testid="anamnesis-review-systems"] | value="ccdcdc" | url=http://localhost:3000/page1.html
- 36. CLICK [data-testid="exam-general-appearance"] | url=http://localhost:3000/page1.html
- 37. INPUT [data-testid="exam-general-appearance"] | value="csdcd" | url=http://localhost:3000/page1.html
- 38. CLICK [data-testid="exam-findings"] | url=http://localhost:3000/page1.html
- 39. INPUT [data-testid="exam-findings"] | value="cdccd" | url=http://localhost:3000/page1.html
- 40. CLICK [data-testid="anamnesis-save-note"] | url=http://localhost:3000/page1.html
- 41. CLICK [data-testid="anamnesis-request-labs"] | url=http://localhost:3000/page1.html
- 42. CLICK a[href="page2.html"] | url=http://localhost:3000/page1.html
- 43. NAVIGATION document | url=http://localhost:3000/page2.html
- 44. CLICK [data-testid="assessment-primary-diagnosis"] | url=http://localhost:3000/page2.html
- 45. INPUT [data-testid="assessment-primary-diagnosis"] | value="sdcsdc" | url=http://localhost:3000/page2.html
- 46. CLICK [data-testid="assessment-icd10"] | url=http://localhost:3000/page2.html
- 47. INPUT [data-testid="assessment-icd10"] | value="dcsdc" | url=http://localhost:3000/page2.html
- 48. CLICK [data-testid="assessment-clinical-impression"] | url=http://localhost:3000/page2.html
- 49. INPUT [data-testid="assessment-clinical-impression"] | value="idc" | url=http://localhost:3000/page2.html
- 50. CLICK [data-testid="rx-medication-name"] | url=http://localhost:3000/page2.html
- 51. INPUT [data-testid="rx-medication-name"] | value="cidc" | url=http://localhost:3000/page2.html
- 52. CLICK [data-testid="rx-medication-dose"] | url=http://localhost:3000/page2.html
- 53. INPUT [data-testid="rx-medication-dose"] | value="sdcsdc" | url=http://localhost:3000/page2.html
- 54. CLICK [data-testid="rx-medication-frequency"] | url=http://localhost:3000/page2.html
- 55. INPUT [data-testid="rx-medication-frequency"] | value="csdcd" | url=http://localhost:3000/page2.html
- 56. CLICK [data-testid="rx-medication-duration"] | url=http://localhost:3000/page2.html
- 57. INPUT [data-testid="rx-medication-duration"] | value="csdcsdc" | url=http://localhost:3000/page2.html
- 58. CLICK [data-testid="rx-instructions"] | url=http://localhost:3000/page2.html
- 59. INPUT [data-testid="rx-instructions"] | value="dcsdcsdcd" | url=http://localhost:3000/page2.html
- 60. CLICK [data-testid="plan-orders"] | url=http://localhost:3000/page2.html
- 61. INPUT [data-testid="plan-orders"] | value="csdcsdc" | url=http://localhost:3000/page2.html
- 62. CLICK [data-testid="plan-follow-up"] | url=http://localhost:3000/page2.html
- 63. INPUT [data-testid="plan-follow-up"] | value="sdcsdcc" | url=http://localhost:3000/page2.html
- 64. CLICK [data-testid="assessment-sign-note"] | url=http://localhost:3000/page2.html
- 65. CLICK [data-testid="assessment-generate-rx"] | url=http://localhost:3000/page2.html
