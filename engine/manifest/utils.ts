import {
  adjectives,
  animals,
  NumberDictionary,
  uniqueNamesGenerator,
} from "unique-names-generator";
const numberDictionary = NumberDictionary.generate({ min: 10, max: 99 });

export const randomSiteName = () => {
  return uniqueNamesGenerator({
    dictionaries: [animals, adjectives, numberDictionary],
    length: 3,
    separator: "-",
  });
};
