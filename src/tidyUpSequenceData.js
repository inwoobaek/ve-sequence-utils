// tnrtodo: figure out where to insert this validation exactly..
const bsonObjectid = require("bson-objectid");
const getAminoAcidDataForEachBaseOfDna = require("./getAminoAcidDataForEachBaseOfDna");
const { cloneDeep } = require("lodash");
const FeatureTypes = require("./FeatureTypes.js");
const areNonNegativeIntegers = require("validate.io-nonnegative-integer-array");
const annotationTypes = require("./annotationTypes");
const featureColors = require("./featureColors");
const filterSequenceString = require("./filterSequenceString");

module.exports = function tidyUpSequenceData(pSeqData, options = {}) {
  const {
    annotationsAsObjects,
    provideNewIdsForAnnotations,
    logMessages,
    removeUnwantedChars,
    additionalValidChars,
    charOverrides
  } = options;
  let seqData = cloneDeep(pSeqData); //sequence is usually immutable, so we clone it and return it
  let response = {
    messages: []
  };
  if (!seqData) {
    seqData = {};
  }
  if (!seqData.sequence && seqData.sequence !== "") {
    seqData.sequence = "";
  }
  if (removeUnwantedChars) {
    seqData.sequence = filterSequenceString(
      seqData.sequence,
      additionalValidChars,
      charOverrides
    );
  }
  seqData.size = seqData.sequence.length;
  if (
    seqData.circular === "false" ||
    /* eslint-disable eqeqeq*/

    seqData.circular == -1 ||
    /* eslint-enable eqeqeq*/

    !seqData.circular
  ) {
    seqData.circular = false;
  } else {
    seqData.circular = true;
  }

  annotationTypes.forEach(function(annotationType) {
    if (!Array.isArray(seqData[annotationType])) {
      if (typeof seqData[annotationType] === "object") {
        seqData[annotationType] = Object.keys(
          seqData[annotationType]
        ).map(function(key) {
          return seqData[annotationType][key];
        });
      } else {
        seqData[annotationType] = [];
      }
    }
    seqData[annotationType] = seqData[annotationType].filter(annotation => {
      return cleanUpAnnotation(annotation, { ...options, seqData, annotationType });
    });
  });

  seqData.translations = seqData.translations.map(function(translation) {
    if (!translation.aminoAcids) {
      translation.aminoAcids = getAminoAcidDataForEachBaseOfDna(
        seqData.sequence,
        translation.forward,
        translation
      );
    }
    return translation;
  });

  if (annotationsAsObjects) {
    annotationTypes.forEach(function(name) {
      seqData[name] = seqData[name].reduce(function(acc, item) {
        let itemId;
        if (areNonNegativeIntegers(item.id) || item.id) {
          itemId = item.id;
        } else {
          itemId = bsonObjectid().str;
          item.id = itemId; //assign the newly created id to the item d
        }
        acc[itemId] = item;
        return acc;
      }, {});
    });
  }
  if (logMessages && response.messages.length > 0) {
    console.log("tidyUpSequenceData messages:", response.messages);
  }
  return seqData;

  function cleanUpAnnotation(annotation, options) {
    const size = options.seqData.size 
    if (!annotation || typeof annotation !== "object") {
      response.messages.push("Invalid annotation detected and removed");
      return false;
    }
    annotation.annotationTypePlural = options.annotationType;

    annotation.start = parseInt(annotation.start, 10);
    annotation.end = parseInt(annotation.end, 10);

    if (!annotation.name || typeof annotation.name !== "string") {
      response.messages.push(
        'Unable to detect valid name for annotation, setting name to "Untitled annotation"'
      );
      annotation.name = "Untitled annotation";
    }
    if (provideNewIdsForAnnotations) {
      annotation.id = bsonObjectid().str;
    }
    if (!annotation.id && annotation.id !== 0) {
      annotation.id = bsonObjectid().str;
      response.messages.push(
        "Unable to detect valid ID for annotation, setting ID to " +
          annotation.id
      );
    }
    if (
      !areNonNegativeIntegers([annotation.start]) ||
      annotation.start > seqData.size - 1
    ) {
      response.messages.push(
        "Invalid annotation start: " +
          annotation.start +
          " detected for " +
          annotation.name +
          " and set to size: " + size 
      ); //setting it to 0 internally, but users will see it as 1
      annotation.start = size-1;
    }
    if (
      !areNonNegativeIntegers([annotation.end]) ||
      annotation.end > seqData.size - 1
    ) {
      response.messages.push(
        "Invalid annotation end:  " +
          annotation.end +
          " detected for " +
          annotation.name +
          " and set to seq size: " + size
      ); //setting it to 0 internally, but users will see it as 1
      annotation.end = size - 1;
    }
    if (annotation.start > annotation.end && seqData.circular === false) {
      response.messages.push(
        "Invalid circular annotation detected for " +
          annotation.name +
          ". end set to 1"
      ); //setting it to 0 internally, but users will see it as 1
      annotation.end = size;
    }

    if (
      annotation.forward === true ||
      annotation.forward === "true" ||
      annotation.strand === 1 ||
      annotation.strand === "1" ||
      annotation.strand === "+"
    ) {
      annotation.forward = true;
      annotation.strand = 1;
    } else {
      annotation.forward = false;
      annotation.strand = -1;
    }

    if (
      !annotation.type ||
      typeof annotation.type !== "string" ||
      FeatureTypes.some(function(featureType) {
        if (featureType.toLowerCase === annotation.type.toLowerCase()) {
          annotation.type = featureType; //this makes sure the annotation.type is being set to the exact value of the accepted featureType
          return true;
        }
        return false;
      })
    ) {
      response.messages.push(
        "Invalid annotation type detected:  " +
          annotation.type +
          " for " +
          annotation.name +
          ". set type to misc_feature"
      );
      annotation.type = "misc_feature";
    }

    if (!annotation.color) {
      annotation.color = featureColors[annotation.type];
    }
    return true;
  }
};
