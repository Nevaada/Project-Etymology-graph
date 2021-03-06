
//enter with this function and the word the user submitted
function handleInput(data) {
    get_ancestors(data);
}

const MAX_DEPTH = 15;

// List, keeps track of the traversed short_urls
var traversedWords = [];

//Map of lists, key is short_url and value is all ancestors
var ancestorMap = {};

//Map of lists, key is short_url and value is short_url of all equivalent words
var equivalentMap = {};

//Map of lists, key is short_url and value is short_url of all equivalent words
var wordNameMap = {};

// Map of 'tuple' ([array of equivalent words, ancestors])
var AncestorTree = [];

// Map of wiktionary links
var wiktionaryLinkMap = {};

// Words that are already treated
var treatedWords = [];


function addAncestor(short_url, ancestor) {
  ancestorMap[short_url] = ancestorMap[short_url] || [];
  ancestorMap[short_url].push(ancestor);
}

function addEquivalent(short_url, equi) {
  equivalentMap[short_url] = equivalentMap[short_url] || [];
  equivalentMap[short_url].push(equi);
}

function addWordName(short_url, name) {
  wordNameMap[short_url] = wordNameMap[short_url] || [];
  wordNameMap[short_url].push(name);
}

function removeDuplicates(num) {
  var x,
      len=num.length,
      out=[],
      obj={};
 
  for (x=0; x<len; x++) {
    obj[num[x]]=0;
  }
  for (x in obj) {
    out.push(x);
  }
  return out;
}

function createCORSRequest(method, url){
    var xhr = new XMLHttpRequest();
    if ("withCredentials" in xhr){
        xhr.open(method, url, true); // true = async
    } else if (typeof XDomainRequest != "undefined"){
        xhr = new XDomainRequest();
        xhr.open(method, url);
    } else {
        xhr = null;
    }
    return xhr;
}

function get_ancestors_from_short_url(short_url, force_no_reset=false) {

  // Initialize vars
  var rootWord = short_url;
  traversedWords = [];
  ancestorMap = {};
  equivalentMap = {};
  wordNameMap = {};
  AncestorTree = [];
  treatedWords = [];
  wiktionaryLinkMap = {};

  search_url(short_url, 0).then(function(result) {
    // executed when collected  data

    console.log(ancestorMap);
    console.log(equivalentMap);
    console.log(wordNameMap);

    var EN = createNodeAndEdgeList(rootWord);
    var accNodes = EN.accNodess;
    var accEdges = EN.accEdgess;

    add_to_dagre_vizu(accNodes, accEdges, short_url, force_no_reset);

  }, function(err) {
    console.log(err);
  });
}

function get_ancestors(word) {
  let short_url = `http://etytree-virtuoso.wmflabs.org/dbnary/eng/__ee_1_${word}`;
  get_ancestors_from_short_url(short_url);
}



// Takes a root word and recursively searches for its ancestors in the datasource. Creates arrays and maps to store the returned data
function search_url(short_url, depth) {
  return new Promise(function(resolve, reject) {

    if(depth > MAX_DEPTH) {
      resolve();
      return;
    }

    if(traversedWords.includes(short_url)) {
      resolve();
      return;
    }
    traversedWords.push(short_url);

    let part1 = 'https://etytree-virtuoso.wmflabs.org/sparql?query=define%20sql%3Adescribe-mode%20%22CBD%22%20%20DESCRIBE%20%3Chttp%3A%2F%2F';
    let part2 = short_url.substring(7); // remove http:// at beginning of string
    let part3 = '%3E&output=text%2Fcsv';
    let url = part1 + part2 + part3;

    var request = createCORSRequest("get", url);
    if (request){
      request.onload = function() {

          let ancestors = d3.csvParse(request.responseText);

          let promises = [];
          ancestors.forEach(function(d) {

                 if(d.predicate.includes('label')) {
                    let word_name = d.object;
                    console.log('Word: ' + word_name);
                    addWordName(short_url, word_name);

                 } else if(d.predicate.includes('etymologicallyRelatedTo')) {
                  let ancestor_short_url = d.object;
                  console.log('is related to: ' + ancestor_short_url);

                  addAncestor(short_url, ancestor_short_url);

                  promises.push(search_url(ancestor_short_url, depth + 1));

                 } else if(d.predicate.includes('etymologicallyEquivalentTo')) {
                  let equivalentWord = d.object;
                  console.log('Equivalent to: ' + equivalentWord);
                  addEquivalent(short_url, equivalentWord);
                 } else if(d.predicate.includes('http://www.w3.org/2000/01/rdf-schema#seeAlso')) {
                  let wiktionaryLink = d.object;
                  wiktionaryLinkMap[short_url] = wiktionaryLink;
                 }
              });

        Promise.all(promises).then(function() {
          resolve(short_url);
        });

      };
      request.onerror = function() {
            reject(new Error("Network Error"));
      };
      request.send();      
    } else {
      reject();
      return;
    }
  });
}


// get all equivalents of word, Checks for equivalents of equivalent words recusively.
function getEquivalents(short_url) {

  function getEquivalentsss(short_url, traversedEqus, acc) {
    if(traversedEqus.includes(short_url)) {
      return acc;
    }
    acc = acc.concat(short_url);

    let equivalents = equivalentMap[short_url] || [];

    equivalents.forEach(function(d) {
      if(!acc.includes(d)) {
        acc = getEquivalentsss(d, traversedEqus, acc);
      }
    });

    return acc;
  }

  return getEquivalentsss(short_url,[],[]);  
}


function getDirectAncestors(short_url) {
  let ancestor = ancestorMap[short_url];
  if(!ancestor) {
    return [];
  }
  let ancestor_equivalents = equivalentMap[ancestor] || [];

  let all_ancestors = ancestor.concat(ancestor_equivalents);

  return all_ancestors;
}


function getDirectAncestorsMany(short_urls) {
  if (!Array.isArray(short_urls)) {
    return [];
  }

  var ancestors = [];

  short_urls.forEach(function(short_url) {
    let direct_ancestors = getDirectAncestors(short_url);
    ancestors = ancestors.concat(direct_ancestors);
  });

  ancestors = removeDuplicates(ancestors);

  return ancestors;
}


function createNodeAndEdgeList(word) {
  return createNodeAndEdgeListAcc(word, [], [], 0);
}

function createNodeAndEdgeListAcc(word, accNodes, accEdges, depth) {
  let equs = getEquivalents(word);

  let language_code = get_language_code(word);
  let language_name = get_language_name(language_code);

  let nodeItem = {};
  nodeItem["name"] = equs.map(x => wordNameMap[x]).join(", ");
  nodeItem["short_url"] = word;
  nodeItem["language_code"] = language_code;
  nodeItem["language_name"] = language_name;
  nodeItem["wiktionary_link"] = wiktionaryLinkMap[word];

  if(depth == 0){
    nodeItem["isRoot"] = true;
  }

  accNodes.push(nodeItem);

  let ancestors = getDirectAncestorsMany(equs);

  var nodeList = [];
  let childrenArray = [];
  ancestors.forEach(function(ancestor) {
    
    if(treatedWords.includes(ancestor)) {
      return [];
    }
    treatedWords.push(ancestor);

    var newEdge = {
      source: ancestor,
      target: word,
      language: get_language_name(get_language_code(ancestor))
    }

    accEdges.push(newEdge);

    var ret = createNodeAndEdgeListAcc(ancestor, accNodes, accEdges, depth + 1);

  });

  return {
    accNodess: accNodes,
    accEdgess: accEdges
  };

}
