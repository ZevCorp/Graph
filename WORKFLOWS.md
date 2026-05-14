# Registered Workflows

## wf_1778724462696

- Purpose: Untitled workflow
- Status: done
- CLI: `node index.js "run wf_1778724462696" --input_3="..." --input_5="..." --input_7="..." --input_10="..." --input_12="..." --input_14="..." --input_16="..." --input_18="..." --input_20="..." --input_22="..." --input_24="..." --input_30="..." --input_32="..." --input_34="..." --input_36="..." --input_38="..." --input_40="..." --input_42="..." --input_48="..." --input_50="..." --input_52="..." --input_54="..." --input_56="..." --input_58="..." --input_60="..." --input_62="..." --input_64="..." --input_66="..."`

### Variables
- `input_3`: field="Medical record number" Value for Medical record number (default: `ndghnfghn`)
- `input_5`: field="First name" Value for First name (default: `nghfnfghn`)
- `input_7`: field="Last name" Value for Last name (default: `nfghnfghn`)
- `input_10`: field="Date of birth" Value for Date of birth (default: `2026-06-05`)
- `input_12`: field="Mobile phone" Value for Mobile phone (default: `nfghnfghnfghnf`)
- `input_14`: field="Insurer / payer" Value for Insurer / payer (default: `nfghnfghn`)
- `input_16`: field="Chief complaint" Value for Chief complaint (default: `hgnfghn`)
- `input_18`: field="Temperature" Value for Temperature (default: `ghnfghn`)
- `input_20`: field="Heart rate" Value for Heart rate (default: `fghnfghn`)
- `input_22`: field="Blood pressure" Value for Blood pressure (default: `fghnfgn`)
- `input_24`: field="SpO2" Value for SpO2 (default: `ghnfgnh`)
- `input_30`: field="Days with symptoms" Value for Days with symptoms (default: `nhgfnfghn`)
- `input_32`: field="History of present illness" Value for History of present illness (default: `ghnfghnfghgnfghn`)
- `input_34`: field="Relevant medical history" Value for Relevant medical history (default: `fghnfgh`)
- `input_36`: field="Allergies" Value for Allergies (default: `nfghnf`)
- `input_38`: field="Review of systems" Value for Review of systems (default: `ghnfghnfghnfghn`)
- `input_40`: field="General appearance" Value for General appearance (default: `fghn`)
- `input_42`: field="Physical exam findings" Value for Physical exam findings (default: `fghnfghnfghn`)
- `input_48`: field="Primary diagnosis" Value for Primary diagnosis (default: `nfghnfghn`)
- `input_50`: field="ICD-10 code" Value for ICD-10 code (default: `nfghn`)
- `input_52`: field="Clinical impression" Value for Clinical impression (default: `hnfghnfghnfghnfghn`)
- `input_54`: field="Medication" Value for Medication (default: `fghnfghn`)
- `input_56`: field="Dose" Value for Dose (default: `fghnfghn`)
- `input_58`: field="Frequency" Value for Frequency (default: `fghnfghn`)
- `input_60`: field="Duration" Value for Duration (default: `fghnfghn`)
- `input_62`: field="Patient instructions" Value for Patient instructions (default: `fghnfghngfhn`)
- `input_64`: field="Additional orders" Value for Additional orders (default: `fghnf`)
- `input_66`: field="Follow-up plan" Value for Follow-up plan (default: `ghnfghnfghnfghnfghn`)

### Steps
- 1. NAVIGATION document | label="Graph EMR Trainer" | url=http://localhost:3000/index.html
- 2. CLICK [data-testid="intake-patient-id"] | label="Medical record number" | control=text | url=http://localhost:3000/index.html
- 3. INPUT [data-testid="intake-patient-id"] | value="ndghnfghn" | label="Medical record number" | control=text | url=http://localhost:3000/index.html
- 4. CLICK [data-testid="intake-first-name"] | label="First name" | control=text | url=http://localhost:3000/index.html
- 5. INPUT [data-testid="intake-first-name"] | value="nghfnfghn" | label="First name" | control=text | url=http://localhost:3000/index.html
- 6. CLICK [data-testid="intake-last-name"] | label="Last name" | control=text | url=http://localhost:3000/index.html
- 7. INPUT [data-testid="intake-last-name"] | value="nfghnfghn" | label="Last name" | control=text | url=http://localhost:3000/index.html
- 8. CLICK [data-testid="intake-dob"] | label="Date of birth" | control=date | url=http://localhost:3000/index.html
- 9. CLICK [data-testid="intake-dob"] | label="Date of birth" | control=date | url=http://localhost:3000/index.html
- 10. INPUT [data-testid="intake-dob"] | value="2026-06-05" | label="Date of birth" | control=date | url=http://localhost:3000/index.html
- 11. CLICK [data-testid="intake-phone"] | label="Mobile phone" | control=text | url=http://localhost:3000/index.html
- 12. INPUT [data-testid="intake-phone"] | value="nfghnfghnfghnf" | label="Mobile phone" | control=text | url=http://localhost:3000/index.html
- 13. CLICK [data-testid="intake-insurance"] | label="Insurer / payer" | control=text | url=http://localhost:3000/index.html
- 14. INPUT [data-testid="intake-insurance"] | value="nfghnfghn" | label="Insurer / payer" | control=text | url=http://localhost:3000/index.html
- 15. CLICK [data-testid="intake-chief-complaint"] | label="Chief complaint" | control=textarea | url=http://localhost:3000/index.html
- 16. INPUT [data-testid="intake-chief-complaint"] | value="hgnfghn" | label="Chief complaint" | control=textarea | url=http://localhost:3000/index.html
- 17. CLICK [data-testid="triage-temperature"] | label="Temperature" | control=text | url=http://localhost:3000/index.html
- 18. INPUT [data-testid="triage-temperature"] | value="ghnfghn" | label="Temperature" | control=text | url=http://localhost:3000/index.html
- 19. CLICK [data-testid="triage-heart-rate"] | label="Heart rate" | control=text | url=http://localhost:3000/index.html
- 20. INPUT [data-testid="triage-heart-rate"] | value="fghnfghn" | label="Heart rate" | control=text | url=http://localhost:3000/index.html
- 21. CLICK [data-testid="triage-blood-pressure"] | label="Blood pressure" | control=text | url=http://localhost:3000/index.html
- 22. INPUT [data-testid="triage-blood-pressure"] | value="fghnfgn" | label="Blood pressure" | control=text | url=http://localhost:3000/index.html
- 23. CLICK [data-testid="triage-oxygen"] | label="SpO2" | control=text | url=http://localhost:3000/index.html
- 24. INPUT [data-testid="triage-oxygen"] | value="ghnfgnh" | label="SpO2" | control=text | url=http://localhost:3000/index.html
- 25. CLICK [data-testid="intake-save-patient"] | label="intake-save-patient" | control=button | url=http://localhost:3000/index.html
- 26. CLICK [data-testid="intake-open-chart"] | label="intake-open-chart" | control=button | url=http://localhost:3000/index.html
- 27. NAVIGATION document | label="EMR Anamnesis" | url=http://localhost:3000/page1.html
- 27. CLICK a[href="page1.html"] | control=a | url=http://localhost:3000/index.html
- 29. CLICK [data-testid="anamnesis-symptom-days"] | label="Days with symptoms" | control=text | url=http://localhost:3000/page1.html
- 30. INPUT [data-testid="anamnesis-symptom-days"] | value="nhgfnfghn" | label="Days with symptoms" | control=text | url=http://localhost:3000/page1.html
- 31. CLICK [data-testid="anamnesis-history-illness"] | label="History of present illness" | control=textarea | url=http://localhost:3000/page1.html
- 32. INPUT [data-testid="anamnesis-history-illness"] | value="ghnfghnfghgnfghn" | label="History of present illness" | control=textarea | url=http://localhost:3000/page1.html
- 33. CLICK [data-testid="anamnesis-medical-history"] | label="Relevant medical history" | control=textarea | url=http://localhost:3000/page1.html
- 34. INPUT [data-testid="anamnesis-medical-history"] | value="fghnfgh" | label="Relevant medical history" | control=textarea | url=http://localhost:3000/page1.html
- 35. CLICK [data-testid="anamnesis-allergies"] | label="Allergies" | control=textarea | url=http://localhost:3000/page1.html
- 36. INPUT [data-testid="anamnesis-allergies"] | value="nfghnf" | label="Allergies" | control=textarea | url=http://localhost:3000/page1.html
- 37. CLICK [data-testid="anamnesis-review-systems"] | label="Review of systems" | control=textarea | url=http://localhost:3000/page1.html
- 38. INPUT [data-testid="anamnesis-review-systems"] | value="ghnfghnfghnfghn" | label="Review of systems" | control=textarea | url=http://localhost:3000/page1.html
- 39. CLICK [data-testid="exam-general-appearance"] | label="General appearance" | control=textarea | url=http://localhost:3000/page1.html
- 40. INPUT [data-testid="exam-general-appearance"] | value="fghn" | label="General appearance" | control=textarea | url=http://localhost:3000/page1.html
- 41. CLICK [data-testid="exam-findings"] | label="Physical exam findings" | control=textarea | url=http://localhost:3000/page1.html
- 42. INPUT [data-testid="exam-findings"] | value="fghnfghnfghn" | label="Physical exam findings" | control=textarea | url=http://localhost:3000/page1.html
- 43. CLICK [data-testid="anamnesis-save-note"] | label="anamnesis-save-note" | control=button | url=http://localhost:3000/page1.html
- 44. CLICK [data-testid="anamnesis-request-labs"] | label="anamnesis-request-labs" | control=button | url=http://localhost:3000/page1.html
- 45. CLICK a[href="page2.html"] | control=a | url=http://localhost:3000/page1.html
- 46. NAVIGATION document | label="EMR Diagnosis and Prescription" | url=http://localhost:3000/page2.html
- 47. CLICK [data-testid="assessment-primary-diagnosis"] | label="Primary diagnosis" | control=text | url=http://localhost:3000/page2.html
- 48. INPUT [data-testid="assessment-primary-diagnosis"] | value="nfghnfghn" | label="Primary diagnosis" | control=text | url=http://localhost:3000/page2.html
- 49. CLICK [data-testid="assessment-icd10"] | label="ICD-10 code" | control=text | url=http://localhost:3000/page2.html
- 50. INPUT [data-testid="assessment-icd10"] | value="nfghn" | label="ICD-10 code" | control=text | url=http://localhost:3000/page2.html
- 51. CLICK [data-testid="assessment-clinical-impression"] | label="Clinical impression" | control=textarea | url=http://localhost:3000/page2.html
- 52. INPUT [data-testid="assessment-clinical-impression"] | value="hnfghnfghnfghnfghn" | label="Clinical impression" | control=textarea | url=http://localhost:3000/page2.html
- 53. CLICK [data-testid="rx-medication-name"] | label="Medication" | control=text | url=http://localhost:3000/page2.html
- 54. INPUT [data-testid="rx-medication-name"] | value="fghnfghn" | label="Medication" | control=text | url=http://localhost:3000/page2.html
- 55. CLICK [data-testid="rx-medication-dose"] | label="Dose" | control=text | url=http://localhost:3000/page2.html
- 56. INPUT [data-testid="rx-medication-dose"] | value="fghnfghn" | label="Dose" | control=text | url=http://localhost:3000/page2.html
- 57. CLICK [data-testid="rx-medication-frequency"] | label="Frequency" | control=text | url=http://localhost:3000/page2.html
- 58. INPUT [data-testid="rx-medication-frequency"] | value="fghnfghn" | label="Frequency" | control=text | url=http://localhost:3000/page2.html
- 59. CLICK [data-testid="rx-medication-duration"] | label="Duration" | control=text | url=http://localhost:3000/page2.html
- 60. INPUT [data-testid="rx-medication-duration"] | value="fghnfghn" | label="Duration" | control=text | url=http://localhost:3000/page2.html
- 61. CLICK [data-testid="rx-instructions"] | label="Patient instructions" | control=textarea | url=http://localhost:3000/page2.html
- 62. INPUT [data-testid="rx-instructions"] | value="fghnfghngfhn" | label="Patient instructions" | control=textarea | url=http://localhost:3000/page2.html
- 63. CLICK [data-testid="plan-orders"] | label="Additional orders" | control=textarea | url=http://localhost:3000/page2.html
- 64. INPUT [data-testid="plan-orders"] | value="fghnf" | label="Additional orders" | control=textarea | url=http://localhost:3000/page2.html
- 65. CLICK [data-testid="plan-follow-up"] | label="Follow-up plan" | control=textarea | url=http://localhost:3000/page2.html
- 66. INPUT [data-testid="plan-follow-up"] | value="ghnfghnfghnfghnfghn" | label="Follow-up plan" | control=textarea | url=http://localhost:3000/page2.html
- 67. CLICK [data-testid="assessment-sign-note"] | label="assessment-sign-note" | control=button | url=http://localhost:3000/page2.html
- 68. CLICK [data-testid="assessment-generate-rx"] | label="assessment-generate-rx" | control=button | url=http://localhost:3000/page2.html

## wf_1778728369811

- Purpose: User navigates to the car‑rental quote page (http://localhost:3000/examples/car-demo), clicks the start‑date field, enters “sfgsdgsdgdf”, clicks the end‑date field, enters “sdfgsdfgsdfg”, and finally clicks the “COTIZAR” submit button to request a quote.
- Status: done
- CLI: `node index.js "run wf_1778728369811" --input_3="..." --input_5="..."`

### Variables
- `input_3`: field="desde" Value for desde (default: `sfgsdgsdgdf`)
- `input_5`: field="hasta" Value for hasta (default: `sdfgsdfgsdfg`)

### Steps
- 1. NAVIGATION document | label="Alquiler de Carros en Medellín | Rent a Car Medellín 24h" | url=http://localhost:3000/examples/car-demo
- 2. CLICK #desde | label="desde" | control=text | url=http://localhost:3000/examples/car-demo
- 3. INPUT #desde | value="sfgsdgsdgdf" | label="desde" | control=text | url=http://localhost:3000/examples/car-demo
- 4. CLICK #hasta | label="hasta" | control=text | url=http://localhost:3000/examples/car-demo
- 5. INPUT #hasta | value="sdfgsdfgsdfg" | label="hasta" | control=text | url=http://localhost:3000/examples/car-demo
- 6. CLICK input | control=submit | url=http://localhost:3000/examples/car-demo

## wf_1778783393587

- Purpose: Car rental quote workflow
- Status: done
- CLI: `node index.js "run wf_1778783393587" --input_3="..." --input_5="..." --input_10="..." --input_12="..." --input_13="..." --input_15="..." --input_17="..." --input_19="..." --input_21="..." --input_25="..." --input_27="..." --input_29="..." --input_31="..." --input_33="..." --input_35="..." --input_37="..." --input_39="..."`

### Variables
- `input_3`: field="desde" Value for desde (default: `2026-05-18`)
- `input_5`: field="hasta" Value for hasta (default: `2026-05-05`)
- `input_10`: field="Email *" Value for Email * (default: `fivjnhsfivnfio@gmail.com`)
- `input_12`: field="Nombres *" Value for Nombres * (default: `Felipe`)
- `input_13`: field="Apellidos *" Value for Apellidos * (default: `Maldonado`)
- `input_15`: field="Numero de Documento *" Value for Numero de Documento * (default: `cdcsdc`)
- `input_17`: field="Fecha de nacimiento *" Value for Fecha de nacimiento * (default: `cdscsdcsdc`)
- `input_19`: field="Nacionalidad" Value for Nacionalidad (default: `cdscsdc`)
- `input_21`: field="Ciudad de residencia *" Value for Ciudad de residencia * (default: `tgrtgrtgrtgrtg`)
- `input_25`: field="Ciudad de residencia *" Value for Ciudad de residencia * (default: `cdscsdcds`)
- `input_27`: field="Telefono con WhatsApp *" Value for Telefono con WhatsApp * (default: `+573502678360`)
- `input_29`: field="Codigo de Reserva aerea" Value for Codigo de Reserva aerea (default: `vsfvfv`)
- `input_31`: field="Aerolinea" Value for Aerolinea (default: `vdfvdfv`)
- `input_33`: field="Numero de vuelo" Value for Numero de vuelo (default: `vfdsvdfv`)
- `input_35`: field="Ciudad de procedencia del vuelo" Value for Ciudad de procedencia del vuelo (default: `vdfvsdfv`)
- `input_37`: field="Direccion hospedaje en Medellin" Value for Direccion hospedaje en Medellin (default: `fdvsdfv`)
- `input_39`: field="Comentarios y requerimientos adicionales" Value for Comentarios y requerimientos adicionales (default: `vdfvdsfv`)

### Steps
- 1. NAVIGATION document | label="Alquiler de Carros en Medellín | Rent a Car Medellín 24h" | url=http://localhost:3000/examples/car-demo
- 2. CLICK [data-testid="pickup-date"] | label="desde" | control=date | url=http://localhost:3000/examples/car-demo
- 3. INPUT [data-testid="pickup-date"] | value="2026-05-18" | label="desde" | control=date | url=http://localhost:3000/examples/car-demo
- 4. CLICK [data-testid="return-date"] | label="hasta" | control=date | url=http://localhost:3000/examples/car-demo
- 5. INPUT [data-testid="return-date"] | value="2026-05-05" | label="hasta" | control=date | url=http://localhost:3000/examples/car-demo
- 6. CLICK [data-testid="quote-submit"] | label="quote-submit" | control=submit | url=http://localhost:3000/examples/car-demo
- 7. NAVIGATION document | label="Flota disponible | Rent a Car Medellin" | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 8. CLICK [data-testid="reserve-renault-duster"] | label="reserve-renault-duster" | control=button | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 9. CLICK [data-testid="client-email"] | label="Email *" | control=email | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 10. INPUT [data-testid="client-email"] | value="fivjnhsfivnfio@gmail.com" | label="Email *" | control=email | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 11. CLICK [data-testid="client-first-name"] | label="Nombres *" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 12. INPUT [data-testid="client-first-name"] | value="Felipe" | label="Nombres *" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 13. INPUT [data-testid="client-last-name"] | value="Maldonado" | label="Apellidos *" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 14. CLICK [data-testid="client-document-number"] | label="Numero de Documento *" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 15. INPUT [data-testid="client-document-number"] | value="cdcsdc" | label="Numero de Documento *" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 16. CLICK [data-testid="client-birth-date"] | label="Fecha de nacimiento *" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 17. INPUT [data-testid="client-birth-date"] | value="cdscsdcsdc" | label="Fecha de nacimiento *" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 18. CLICK [data-testid="client-nationality"] | label="Nacionalidad" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 19. INPUT [data-testid="client-nationality"] | value="cdscsdc" | label="Nacionalidad" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 20. CLICK [data-testid="client-city"] | label="Ciudad de residencia *" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 21. INPUT [data-testid="client-city"] | value="tgrtgrtgrtgrtg" | label="Ciudad de residencia *" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 22. CLICK [data-testid="client-city"] | label="Ciudad de residencia *" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 23. CLICK [data-testid="client-city"] | label="Ciudad de residencia *" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 24. CLICK [data-testid="client-city"] | label="Ciudad de residencia *" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 25. INPUT [data-testid="client-city"] | value="cdscsdcds" | label="Ciudad de residencia *" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 26. CLICK [data-testid="client-whatsapp"] | label="Telefono con WhatsApp *" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 27. INPUT [data-testid="client-whatsapp"] | value="+573502678360" | label="Telefono con WhatsApp *" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 28. CLICK [data-testid="flight-reservation-code"] | label="Codigo de Reserva aerea" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 29. INPUT [data-testid="flight-reservation-code"] | value="vsfvfv" | label="Codigo de Reserva aerea" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 30. CLICK [data-testid="flight-airline"] | label="Aerolinea" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 31. INPUT [data-testid="flight-airline"] | value="vdfvdfv" | label="Aerolinea" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 32. CLICK [data-testid="flight-number"] | label="Numero de vuelo" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 33. INPUT [data-testid="flight-number"] | value="vfdsvdfv" | label="Numero de vuelo" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 34. CLICK [data-testid="flight-origin-city"] | label="Ciudad de procedencia del vuelo" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 35. INPUT [data-testid="flight-origin-city"] | value="vdfvsdfv" | label="Ciudad de procedencia del vuelo" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 36. CLICK [data-testid="lodging-address"] | label="Direccion hospedaje en Medellin" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 37. INPUT [data-testid="lodging-address"] | value="fdvsdfv" | label="Direccion hospedaje en Medellin" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 38. CLICK [data-testid="additional-comments"] | label="Comentarios y requerimientos adicionales" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
- 39. INPUT [data-testid="additional-comments"] | value="vdfvdsfv" | label="Comentarios y requerimientos adicionales" | control=text | url=http://localhost:3000/rentacar/reservar.html?desde=2026-05-18&desdeH=01%3A00&entrega=ofc&hasta=2026-05-05&hastaH=01%3A00&devuelve=ofc&source=
