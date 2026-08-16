# English picture naming photo manifest

All 150 assessment images are resized and compressed derivatives of camera photographs. No image-generation model, synthetic fill, subject removal, or background replacement was used. The assessment displays each file as a full-bleed `aspectFill` card so the real photo becomes the card surface; the stored source derivative remains unchanged and auditable. The original ten animal files use JPEG; the remaining 140 primary files use WebP. The backend also stores a JPEG fallback for every item so devices that cannot render a primary WebP can retry without changing the assessment content.

## Photo quality policy

- Prefer a single, unmistakable subject that still reads clearly after the card's centered crop.
- Use manually selected fixed-bank assets, not a runtime image API or random-photo endpoint.
- Prefer Unsplash for animals, transport, and natural scenes when the subject remains unambiguous; prefer neutral or white-background Wikimedia Commons photographs for isolated objects.
- Reject generated, illustrated, composited, watermarked, text-heavy, or background-replaced images.
- Keep the original source URL, creator, license, and any non-generative resize or crop notes in this manifest.
- New replacements should use a source at least 1200 px on its long edge and a local derivative large enough not to upscale at the card's rendered size.

| File | Real-world subject | Source | Creator / license |
| --- | --- | --- | --- |
| `cat.jpg` | Cat | https://unsplash.com/photos/r_Jp9k2i01g | Unsplash photo / Unsplash License |
| `dog.jpg` | Dog | https://commons.wikimedia.org/wiki/File:Standing_dog.jpg | Wikimedia Commons file; see source page for author and license |
| `bird.jpg` | Bird | https://unsplash.com/photos/DA1DR90t_xI | Unsplash photo / Unsplash License |
| `fish.jpg` | Common roach fish | https://commons.wikimedia.org/wiki/File:A_photo_of_a_common_roach_with_a_lot_fishes_in_aquarium_(cropped).jpg | Retro Lenses / CC BY 4.0 |
| `duck.jpg` | Duck | https://unsplash.com/photos/duldpttwi2w | Unsplash photo / Unsplash License |
| `horse.jpg` | Horse | Source URL recorded in the photo candidate audit | See audit |
| `cow.jpg` | Cow | https://commons.wikimedia.org/wiki/File:Lone_cow_in_a_field_-_2_June_2025.jpg | Wikimedia Commons file; see source page for author and license |
| `sheep.jpg` | Sheep | https://unsplash.com/photos/_bklhwAuOvw | Unsplash photo / Unsplash License |
| `elephant.jpg` | Elephant | https://unsplash.com/photos/XiOQhhXWX6Y | Unsplash photo / Unsplash License |
| `monkey.jpg` | Long-tailed macaque | https://commons.wikimedia.org/wiki/File:Long-tailed_Macaque_357899609.jpg | Wikimedia Commons file; see source page for author and license |

## Original four non-animal packs

These are local manual-flow candidates, not production-cleared assessment assets. Each source page must still receive a frozen license snapshot and the final image must pass the naming pretest before release.

| File | Source | Creator | License on source page |
| --- | --- | --- | --- |
| `apple.webp` | https://commons.wikimedia.org/wiki/File:Apple_(1).jpg | Renee Comet / National Cancer Institute | Public domain; resized to 960 × 640 WebP without background replacement |
| `banana-focus.webp` | https://commons.wikimedia.org/wiki/File:Banana_isolated_on_white.jpg | robin_24 | CC BY 2.0; tightly cropped and padded on its existing white background to a 960 × 960 WebP without altering the photographed banana |
| `orange.webp` | https://commons.wikimedia.org/wiki/File:Oranges_-_whole-halved-segment.jpg | Ivar Leidus | CC BY-SA 4.0 |
| `egg.webp` | https://commons.wikimedia.org/wiki/File:Huevo_frito.jpg | Horacio Cambeiro | CC BY-SA 4.0 |
| `bread.webp` | https://commons.wikimedia.org/wiki/File:Korb_mit_Br%C3%B6tchen.JPG | 3268zauber | CC BY-SA 3.0 |
| `cake.webp` | https://commons.wikimedia.org/wiki/File:Pound_layer_cake.jpg | Scheinwerfermann | Public domain |
| `carrot.webp` | https://commons.wikimedia.org/wiki/File:Vegetable-Carrot-Bundle-wStalks.jpg | Evan-Amos | Public domain |
| `tomato.webp` | https://commons.wikimedia.org/wiki/File:Tomato_je.jpg | Softeis | CC BY-SA 3.0 |
| `potato.webp` | https://commons.wikimedia.org/wiki/File:Patates.jpg | Scott Bauer, USDA ARS | Public domain |
| `rice.webp` | https://commons.wikimedia.org/wiki/File:Meshi_001.jpg | Ocdp | CC0 |
| `book.webp` | https://commons.wikimedia.org/wiki/File:Gutenberg_Bible,_Lenox_Copy,_New_York_Public_Library,_2009._Pic_01.jpg | NYC Wanderer (Kevin Eng) | CC BY-SA 2.0 |
| `pencil.webp` | https://commons.wikimedia.org/wiki/File:Pencils_hb.jpg | Dmgerman | CC BY 3.0 |
| `ruler-focus.webp` | https://commons.wikimedia.org/wiki/File:20-cm-Holzlineal_PGH_Seiffener_Volkskunst_diagonal_2021.jpg | VSchagow | CC BY-SA 4.0; padded on its existing white background and resized to a 960 × 960 WebP without altering the photographed ruler |
| `chair.webp` | https://commons.wikimedia.org/wiki/File:Set_of_fourteen_side_chairs_MET_DP110780.jpg | Metropolitan Museum of Art | CC0 |
| `table-focus.webp` | https://www.pexels.com/photo/close-up-of-a-wooden-table-11112739/ | Ksenia Chernaya | Pexels License; cropped from the real studio photograph and resized to a 960 × 960 WebP without background replacement |
| `bed-modern.webp` | https://www.pexels.com/photo/white-bed-linen-on-bed-10171454/ | Andrea Davis | Pexels License; center-cropped from the real photograph and resized to a 960 × 960 WebP without background replacement |
| `door-modern-focus.webp` | https://unsplash.com/photos/closed-white-door-0byB36fjECg | Paul Hanaoka | Unsplash License; tightly cropped from the real photograph and resized to a 960 px wide WebP without background replacement |
| `window.webp` | https://commons.wikimedia.org/wiki/File:Atua_Kosua_shrine4.jpg | Shahadusadik | CC BY-SA 4.0 |
| `clock.webp` | https://commons.wikimedia.org/wiki/File:Pendulum_clock_by_Jacob_Kock,_antique_furniture_photography,_IMG_0931_edit.jpg | Christoph Braun | CC0 |
| `bag.webp` | https://commons.wikimedia.org/wiki/File:Bolsas-de-asa-plana-interior-bolsapubli.jpg | Bolsapubli | CC BY-SA 3.0 |
| `hand.webp` | https://commons.wikimedia.org/wiki/File:Hand,_fingers_-_back.jpg | Tomas Gunnarsson / Wikimedia | CC BY-SA 4.0 |
| `foot.webp` | https://commons.wikimedia.org/wiki/File:Foot_on_white_background.jpg | Tomas Gunnarsson / Wikimedia | CC BY-SA 4.0 |
| `eye.webp` | https://commons.wikimedia.org/wiki/File:Human_eye_with_blood_vessels.jpg | ROTFLOLEB | CC BY-SA 3.0 |
| `ear.webp` | https://commons.wikimedia.org/wiki/File:Human_right_ear_(cropped).jpg | Tomas Gunnarsson / Wikimedia Sverige | CC BY-SA 4.0 |
| `nose.webp` | https://commons.wikimedia.org/wiki/File:Fort_Ross_Elena_wearing_Traditional_Russian_Costume_(cropped).jpg | Franco Folini | CC BY-SA 2.0 |
| `mouth.webp` | https://commons.wikimedia.org/wiki/File:Mouth_and_lips_(21130060419).jpg | StockyPics | CC0 |
| `hair.webp` | https://commons.wikimedia.org/wiki/File:Deepthy.jpg | 1840466deepthyrosemathew | CC BY-SA 4.0 |
| `hat.webp` | https://commons.wikimedia.org/wiki/File:Collapsible_top_hat_IMGP9692.jpg | Nikodem Nijaki | CC BY-SA 3.0 |
| `shoe.webp` | https://commons.wikimedia.org/wiki/File:Skor_fr%C3%A5n_1700-_till_1960-talet_-_Nordiska_Museet_-_NMA.0056302.jpg | Nordiska Museet | CC BY 3.0 NO |
| `shirt.webp` | https://commons.wikimedia.org/wiki/File:Charvet_shirt.jpg | Unknown photographer | CC BY-SA 3.0 |
| `car.webp` | https://commons.wikimedia.org/wiki/File:1925_Ford_Model_T_touring.jpg | ModelTMitch | Public domain |
| `bus.webp` | https://commons.wikimedia.org/wiki/File:LTZ1328-19-20241030-160332.jpg | SIA321 | CC BY-SA 4.0 |
| `train.webp` | https://commons.wikimedia.org/wiki/File:%D0%9F%D0%BE%D0%B5%D0%B7%D0%B4_%D0%BD%D0%B0_%D1%84%D0%BE%D0%BD%D0%B5_%D0%B3%D0%BE%D1%80%D1%8B_%D0%A8%D0%B0%D1%82%D1%80%D0%B8%D1%89%D0%B5._%D0%92%D0%BE%D1%80%D0%BE%D0%BD%D0%B5%D0%B6%D1%81%D0%BA%D0%B0%D1%8F_%D0%BE%D0%B1%D0%BB%D0%B0%D1%81%D1%82%D1%8C.jpg | Алексей Задонский | CC BY-SA 4.0 |
| `bike.webp` | https://commons.wikimedia.org/wiki/File:Left_side_of_Flying_Pigeon.jpg | 齐健 | CC BY 2.0 |
| `boat.webp` | https://commons.wikimedia.org/wiki/File:Motorboat_at_Kankaria_lake.JPG | Kondicherry | CC BY-SA 3.0 |
| `plane.webp` | https://commons.wikimedia.org/wiki/File:United_Airlines_Boeing_777-200_Meulemans.jpg | Jules Meulemans | GFDL |
| `truck.webp` | https://commons.wikimedia.org/wiki/File:Freightliner_M2_106_6x4_2014_(14240376744).jpg | order_242 | CC BY-SA 2.0 |
| `sun-sky.webp` | https://commons.wikimedia.org/wiki/File:Blue_sunshine.jpg | Tyingtina | CC BY-SA 4.0; cropped from the 960px real-photo derivative to a 960 × 960 WebP without background replacement |
| `tree.webp` | https://commons.wikimedia.org/wiki/File:Usamljeni_jasen_-_panoramio_(cropped).jpg | menergo | CC BY-SA 3.0 |
| `flower.webp` | https://commons.wikimedia.org/wiki/File:Magnolia_grandiflora_-_flower_1.jpg | Ianaré Sévi | CC BY-SA 3.0 |

## Expanded pack assets

These 25 photos extend every pack from 10 to 15 words. Each source derivative was center-cropped and resized to a 960 × 960 WebP without generative editing or background replacement. `pen.webp` was fitted to a square using the source photo's existing neutral background so the full pen remains visible.

| File | Source | Creator | License on source page |
| --- | --- | --- | --- |
| `rabbit.webp` | https://commons.wikimedia.org/wiki/File:Rabbit_(Oryctolagus_cuniculus)_Skomer.jpg | Charles J. Sharp | CC BY-SA 4.0 |
| `pig.webp` | https://commons.wikimedia.org/wiki/File:Pig_in_mud_in_Berkshire_-_geograph.org.uk_-_981002.jpg | Graham Horn | CC BY-SA 2.0 |
| `lion.webp` | https://commons.wikimedia.org/wiki/File:Lion_male.jpg | Byrdyak | CC BY-SA 4.0 |
| `tiger.webp` | https://commons.wikimedia.org/wiki/File:Tiger_(India)_3.jpg | Davidvraju | CC BY-SA 4.0 |
| `bear.webp` | https://commons.wikimedia.org/wiki/File:Brown-bear.jpg | Paolo Neo | CC0 |
| `milk.webp` | https://commons.wikimedia.org/wiki/File:Glass_of_Milk_(33657535532).jpg | NIAID | CC BY 2.0 |
| `water.webp` | https://commons.wikimedia.org/wiki/File:Glass-of-water.jpg | Derek Jensen (Tysto) | Public domain |
| `juice.webp` | https://commons.wikimedia.org/wiki/File:Orange_juice_1_edit1.jpg | USDA; edited by Arad | Public domain |
| `cheese.webp` | https://commons.wikimedia.org/wiki/File:White_cheddar_cheese.jpg | Jon Sullivan | Public domain |
| `chicken.webp` | https://commons.wikimedia.org/wiki/File:Roast_Chicken_Hot_Plate.jpg | safaritravelplus | CC0 |
| `pen.webp` | https://commons.wikimedia.org/wiki/File:Jinhao_182_twist_action_ballpoint_pen.jpg | Francis Flinch | CC BY-SA 4.0 |
| `desk.webp` | https://commons.wikimedia.org/wiki/File:Student_Desk.jpg | Rap17 | CC BY-SA 4.0 |
| `cup.webp` | https://commons.wikimedia.org/wiki/File:Coffee_cup_(1).jpg | Jon Sullivan | Public domain |
| `lamp.webp` | https://commons.wikimedia.org/wiki/File:A_desk_lamp.jpg | AirbusA330772673 | CC BY-SA 4.0 |
| `box.webp` | https://commons.wikimedia.org/wiki/File:Cardboard_box.jpg | MrBeastRapper | CC BY-SA 4.0 |
| `arm.webp` | https://commons.wikimedia.org/wiki/File:Arm.agr.jpg | ArnoldReinhold | CC BY-SA 3.0 |
| `leg.webp` | https://commons.wikimedia.org/wiki/File:Photo_of_my_legs.jpg | Punker1999 | CC BY-SA 4.0 |
| `face.webp` | https://commons.wikimedia.org/wiki/File:Face_portrait_(Unsplash).jpg | William Stitt | CC0 |
| `coat.webp` | https://commons.wikimedia.org/wiki/File:Duffell_coat_(2210293264).jpg | cherryred | CC BY 2.0 |
| `dress.webp` | https://commons.wikimedia.org/wiki/File:Black_dress_by_Coco_Chanel.jpg | Danielle Jansen | CC BY-SA 4.0 |
| `taxi.webp` | https://commons.wikimedia.org/wiki/File:Yellow_Ford_taxi_car_on_a_sunny_avenue_(Unsplash).jpg | Jace Grandinetti | CC0 |
| `ship.webp` | https://commons.wikimedia.org/wiki/File:The_cargo_ship_%27Min%27_on_sea_trials_(22789733671).jpg | Tyne & Wear Archives & Museums | No known restrictions |
| `moon.webp` | https://commons.wikimedia.org/wiki/File:Full_Moon_Luc_Viatour.jpg | Luc Viatour | CC BY-SA 3.0 |
| `cloud.webp` | https://commons.wikimedia.org/wiki/File:Single_cloud_in_blue_sky.jpg | Rosmarie Voegtli | CC BY 4.0 |
| `rain.webp` | https://commons.wikimedia.org/wiki/File:Rain_drops_on_window_02_ies.jpg | Frank Vincentz | CC BY-SA 3.0 |

The detailed candidate review and original-file hashes are in `docs/superpowers/specs/2026-08-13-english-picture-naming-real-photo-candidate-audit.md`.

## 30-word pack expansion

The r4 expansion adds another 75 real-photo derivatives, bringing every pack to 30 words and the full inventory to 150. The per-file source, creator, and license records are frozen in [`SOURCES-r4.md`](./SOURCES-r4.md). Candidates carrying NC or ND restrictions were removed from the final bank.

## Manual-review replacements

The 2026-08-15 manual review replaced 29 ambiguous, multi-subject, text-heavy, or low-quality assets. [`REPLACEMENTS-2026-08-15.md`](./REPLACEMENTS-2026-08-15.md) records the general replacements, while [`BODY-CHINESE-REPLACEMENTS-2026-08-15.md`](./BODY-CHINESE-REPLACEMENTS-2026-08-15.md) records the final ten body-word images. For matching filenames, these two manifests supersede earlier rows in this README and `SOURCES-r4.md`.

## China-localized people and body photos

The final ten body-word derivatives use ten different source photographs. Identity-visible faces and facial close-ups prioritize Chinese or East Asian subjects or a clearly Chinese context; anatomical close-ups that do not reveal identity remain separate real-photo sources. `hair.webp` and `arm.webp` use the two user-selected pages recorded in the final body manifest. Each derivative uses only crop, resize, EXIF orientation correction, and WebP compression.
