import {
  adjectives,
  animals,
  NumberDictionary,
  uniqueNamesGenerator,
} from "https://esm.sh/v135/unique-names-generator@4.7.1";
const numberDictionary = NumberDictionary.generate({ min: 10, max: 99 });

export const randomSiteName = () => {
  return uniqueNamesGenerator({
    dictionaries: [animals, adjectives, numberDictionary],
    length: 3,
    separator: "-",
  });
};
