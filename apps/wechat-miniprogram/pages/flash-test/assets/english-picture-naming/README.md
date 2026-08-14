# English picture naming photo manifest

All 50 assessment images are resized and compressed derivatives of camera photographs. No image-generation model, synthetic fill, subject removal, or background replacement was used. The assessment displays each file as a full-bleed `aspectFill` card so the real photo becomes the card surface; the stored source derivative remains unchanged and auditable. The ten animal files use JPEG; the other 40 use WebP to keep the WeChat subpackage within its size budget.

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

## Other four packs

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

The detailed candidate review and original-file hashes are in `docs/superpowers/specs/2026-08-13-english-picture-naming-real-photo-candidate-audit.md`.
