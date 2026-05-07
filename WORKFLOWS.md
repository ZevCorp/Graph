# Registered Workflows

## wf_1778135883265

- Purpose: **Navigation Workflow Overview**

1. **Start Page** – Load `http://localhost:3000/index.html` and open the **Registration Form** (“Graph EMR Trainer”).  
2. **Enter Patient Data** –  
   - Input MRN (`jdcnkjc`), Document Type (`cc`), First/Last Name, DOB, Sex, Insurance, Phone.  
   - Capture chief complaint and triage temperature.  
   - Click **Save Registration** to submit the form.  

3. **Navigate to Anamnesis** – Link jump to `page1.html` (`EMR Anamnesis`).  

4. **Complete Anamnesis Section** –  
   - Select **Visit Type** (`urgent`).  
   - Enter symptom‑duration and narrative values (`cjhskndc`, `csjdknckdjs`).  
   - Add medical history, allergies, review of systems, physical exam findings, and closing observations.  
   - Save the note with **Save Note**.  

5. **Navigate to Diagnosis & Prescription** – Link jump to `page2.html` (`EMR Diagnosis and Prescription`).  

6. **Record Diagnosis** –  
   - Mark primary diagnosis (`Acute viral pharyngitis`).  
   - Add ICD‑10 code and clinical impression.  

7. **Prescribe Medication** –  
   - Add medication name (`csdncskdjnc`), dose (`csjhcnskdcn`), frequency (`jdchnskcnds`), duration (`djhcknskdc`).  
   - Provide instructions (`dcbn skdcnskdc`).  

8. **Document Care Plan & Disposition** –  
   - Enter plan orders (`Wjdhcnksc`).  
   - Specify follow‑up timing (`dsjcsdc`).  
   - Set disposition status to **discharge**.  

9. **Finalize** – Click **Sign Clinical Note** to complete the encounter record.  

**Result:** The user moves sequentially from patient registration through detailed history capture, to structured documentation of diagnosis, medication, and discharge planning, ending with a signed clinical note.
- Status: done
- CLI: `node index.js "run wf_1778135883265" --input_3="..." --input_5="..." --input_6="..." --input_7="..." --input_9="..." --input_11="..." --input_13="..." --input_14="..." --input_16="..." --input_18="..." --input_22="..." --input_24="..." --input_26="..." --input_28="..." --input_30="..." --input_32="..." --input_34="..." --input_36="..." --input_41="..." --input_43="..." --input_45="..." --input_48="..." --input_50="..." --input_52="..." --input_54="..." --input_56="..." --input_58="..." --input_60="..." --input_62="..."`

### Variables
- `input_3`: Value for jdcnkjc (default: `jdcnkjc`)
- `input_5`: Value for cc (default: `cc`)
- `input_6`: Value for fcjnsfkcnjsfc (default: `fcjnsfkcnjsfc`)
- `input_7`: Value for jfnckjsdncs (default: `jfnckjsdncs`)
- `input_9`: Value for 2026-05-05 (default: `2026-05-05`)
- `input_11`: Value for male (default: `male`)
- `input_13`: Value for cjhdncjks (default: `cjhdncjks`)
- `input_14`: Value for cjskdnckdj (default: `cjskdnckdj`)
- `input_16`: Value for cjsdhkncksjnc (default: `cjsdhkncksjnc`)
- `input_18`: Value for jhcdnkd (default: `jhcdnkd`)
- `input_22`: Value for urgent (default: `urgent`)
- `input_24`: Value for cjhskndc (default: `cjhskndc`)
- `input_26`: Value for csjdknckdjs (default: `csjdknckdjs`)
- `input_28`: Value for cjhsndcjk (default: `cjhsndcjk`)
- `input_30`: Value for jeans idc (default: `jeans idc`)
- `input_32`: Value for csdjhkcndskc (default: `csdjhkcndskc`)
- `input_34`: Value for cdscjnsd (default: `cdscjnsd`)
- `input_36`: Value for djchsknckd (default: `djchsknckd`)
- `input_41`: Value for cjsdnckds (default: `cjsdnckds`)
- `input_43`: Value for chjsnc (default: `chjsnc`)
- `input_45`: Value for cjshdkncksjdnc (default: `cjshdkncksjdnc`)
- `input_48`: Value for csdncskdjnc (default: `csdncskdjnc`)
- `input_50`: Value for csjhcnskdcn (default: `csjhcnskdcn`)
- `input_52`: Value for jdchnskcnds (default: `jdchnskcnds`)
- `input_54`: Value for djhcknskdc (default: `djhcknskdc`)
- `input_56`: Value for dcbn skdcnskdc (default: `dcbn skdcnskdc`)
- `input_58`: Value for Wjdhcnksc (default: `Wjdhcnksc`)
- `input_60`: Value for dsjcsdc (default: `dsjcsdc`)
- `input_62`: Value for discharge (default: `discharge`)

### Steps
- 1. NAVIGATION document | url=http://localhost:3000/index.html
- 2. CLICK [data-testid="intake-patient-id"] | url=http://localhost:3000/index.html
- 3. INPUT [data-testid="intake-patient-id"] | value="jdcnkjc" | url=http://localhost:3000/index.html
- 4. CLICK [data-testid="intake-document-type"] | url=http://localhost:3000/index.html
- 5. INPUT [data-testid="intake-document-type"] | value="cc" | url=http://localhost:3000/index.html
- 6. INPUT [data-testid="intake-first-name"] | value="fcjnsfkcnjsfc" | url=http://localhost:3000/index.html
- 7. INPUT [data-testid="intake-last-name"] | value="jfnckjsdncs" | url=http://localhost:3000/index.html
- 8. CLICK [data-testid="intake-dob"] | url=http://localhost:3000/index.html
- 9. INPUT [data-testid="intake-dob"] | value="2026-05-05" | url=http://localhost:3000/index.html
- 10. CLICK [data-testid="intake-dob"] | url=http://localhost:3000/index.html
- 11. INPUT [data-testid="intake-sex"] | value="male" | url=http://localhost:3000/index.html
- 12. CLICK [data-testid="intake-insurance"] | url=http://localhost:3000/index.html
- 13. INPUT [data-testid="intake-insurance"] | value="cjhdncjks" | url=http://localhost:3000/index.html
- 14. INPUT [data-testid="intake-phone"] | value="cjskdnckdj" | url=http://localhost:3000/index.html
- 15. CLICK [data-testid="intake-chief-complaint"] | url=http://localhost:3000/index.html
- 16. INPUT [data-testid="intake-chief-complaint"] | value="cjsdhkncksjnc" | url=http://localhost:3000/index.html
- 17. CLICK [data-testid="triage-temperature"] | url=http://localhost:3000/index.html
- 18. INPUT [data-testid="triage-temperature"] | value="jhcdnkd" | url=http://localhost:3000/index.html
- 19. CLICK [data-testid="intake-save-patient"] | url=http://localhost:3000/index.html
- 20. CLICK a[href="page1.html"] | url=http://localhost:3000/index.html
- 21. NAVIGATION document | url=http://localhost:3000/page1.html
- 22. INPUT [data-testid="anamnesis-visit-type"] | value="urgent" | url=http://localhost:3000/page1.html
- 23. CLICK [data-testid="anamnesis-symptom-days"] | url=http://localhost:3000/page1.html
- 24. INPUT [data-testid="anamnesis-symptom-days"] | value="cjhskndc" | url=http://localhost:3000/page1.html
- 25. CLICK [data-testid="anamnesis-history-illness"] | url=http://localhost:3000/page1.html
- 26. INPUT [data-testid="anamnesis-history-illness"] | value="csjdknckdjs" | url=http://localhost:3000/page1.html
- 27. CLICK [data-testid="anamnesis-medical-history"] | url=http://localhost:3000/page1.html
- 28. INPUT [data-testid="anamnesis-medical-history"] | value="cjhsndcjk" | url=http://localhost:3000/page1.html
- 29. CLICK [data-testid="anamnesis-allergies"] | url=http://localhost:3000/page1.html
- 30. INPUT [data-testid="anamnesis-allergies"] | value="jeans idc" | url=http://localhost:3000/page1.html
- 31. CLICK [data-testid="anamnesis-review-systems"] | url=http://localhost:3000/page1.html
- 32. INPUT [data-testid="anamnesis-review-systems"] | value="csdjhkcndskc" | url=http://localhost:3000/page1.html
- 33. CLICK [data-testid="exam-general-appearance"] | url=http://localhost:3000/page1.html
- 34. INPUT [data-testid="exam-general-appearance"] | value="cdscjnsd" | url=http://localhost:3000/page1.html
- 35. CLICK [data-testid="exam-findings"] | url=http://localhost:3000/page1.html
- 36. INPUT [data-testid="exam-findings"] | value="djchsknckd" | url=http://localhost:3000/page1.html
- 37. CLICK [data-testid="anamnesis-save-note"] | url=http://localhost:3000/page1.html
- 38. CLICK a[href="page2.html"] | url=http://localhost:3000/page1.html
- 39. NAVIGATION document | url=http://localhost:3000/page2.html
- 40. CLICK [data-testid="assessment-primary-diagnosis"] | url=http://localhost:3000/page2.html
- 41. INPUT [data-testid="assessment-primary-diagnosis"] | value="cjsdnckds" | url=http://localhost:3000/page2.html
- 42. CLICK [data-testid="assessment-icd10"] | url=http://localhost:3000/page2.html
- 43. INPUT [data-testid="assessment-icd10"] | value="chjsnc" | url=http://localhost:3000/page2.html
- 44. CLICK [data-testid="assessment-clinical-impression"] | url=http://localhost:3000/page2.html
- 45. INPUT [data-testid="assessment-clinical-impression"] | value="cjshdkncksjdnc" | url=http://localhost:3000/page2.html
- 46. CLICK [data-testid="rx-medication-name"] | url=http://localhost:3000/page2.html
- 47. CLICK [data-testid="rx-medication-name"] | url=http://localhost:3000/page2.html
- 48. INPUT [data-testid="rx-medication-name"] | value="csdncskdjnc" | url=http://localhost:3000/page2.html
- 49. CLICK [data-testid="rx-medication-dose"] | url=http://localhost:3000/page2.html
- 50. INPUT [data-testid="rx-medication-dose"] | value="csjhcnskdcn" | url=http://localhost:3000/page2.html
- 51. CLICK [data-testid="rx-medication-frequency"] | url=http://localhost:3000/page2.html
- 52. INPUT [data-testid="rx-medication-frequency"] | value="jdchnskcnds" | url=http://localhost:3000/page2.html
- 53. CLICK [data-testid="rx-medication-duration"] | url=http://localhost:3000/page2.html
- 54. INPUT [data-testid="rx-medication-duration"] | value="djhcknskdc" | url=http://localhost:3000/page2.html
- 55. CLICK [data-testid="rx-instructions"] | url=http://localhost:3000/page2.html
- 56. INPUT [data-testid="rx-instructions"] | value="dcbn skdcnskdc" | url=http://localhost:3000/page2.html
- 57. CLICK [data-testid="plan-orders"] | url=http://localhost:3000/page2.html
- 58. INPUT [data-testid="plan-orders"] | value="Wjdhcnksc" | url=http://localhost:3000/page2.html
- 59. CLICK [data-testid="plan-follow-up"] | url=http://localhost:3000/page2.html
- 60. INPUT [data-testid="plan-follow-up"] | value="dsjcsdc" | url=http://localhost:3000/page2.html
- 61. CLICK [data-testid="disposition-status"] | url=http://localhost:3000/page2.html
- 62. INPUT [data-testid="disposition-status"] | value="discharge" | url=http://localhost:3000/page2.html
- 63. CLICK [data-testid="assessment-sign-note"] | url=http://localhost:3000/page2.html
