const fs = require('fs');
const path = require('path');
const jsYaml = require('js-yaml');
const { createFilePath } = require('gatsby-source-filesystem');
const sourceRepos = require('./source-repos');
const { fromMkdocsYaml } = require('./src/navigation');

const mainContentConfig = path.join(__dirname, 'src/content/config.yml');
const mainContentFile = fs.readFileSync(mainContentConfig);
const mainContentYaml = jsYaml.load(mainContentFile);
const mainContent = {
  name: 'main-content',
  navigation: fromMkdocsYaml(mainContentYaml, '/'),
};
exports.onPostBootstrap = function cacheSourceData() {
  const sourceData = sourceRepos.filter(({ name, mkdocs, baseURI }) => {
    let isValid = true, msg = 'Skipping source.';
    if (typeof name !== 'string') {
      isValid = false; msg = `${msg} Invalid name: ${name}.`
    }
    if (typeof mkdocs !== 'string') {
      isValid = false; msg = `${msg} Invalid MkDocs path: ${mkdocs}.`
    }
    if (typeof baseURI !== 'string') {
      isValid = false; msg = `${msg} Invalid base URI: ${baseURI}.`
    }
    if (!isValid && process.env.NODE_ENV === 'development') console.warn(msg);
    return isValid;
  }).map((config) => {
    const { name, mkdocs, baseURI } = config;
    const mkdocsPath = path.join(__dirname, '.cache/gatsby-source-git/', name, mkdocs);
    const file = fs.readFileSync(mkdocsPath);
    const yaml = jsYaml.load(file);
    const navigation = fromMkdocsYaml(yaml, baseURI);
    return { ...config, navigation };
  });
  const json = JSON.stringify([mainContent, ...sourceData]);
  const jsonPath = path.join(__dirname, '.cache/__farmOS__source_data.json');
  fs.writeFileSync(jsonPath, json);
};

const multiSlashRE = /\/{2,}/g;
exports.onCreateNode = ({ node, getNode, actions }) => {
  const { createNodeField } = actions;
  // Ensures we are processing only markdown files
  if (node.internal.type === 'MarkdownRemark') {
    const { sourceInstanceName } = getNode(node.parent);
    const repoConfig = sourceRepos.find(c => c.name === sourceInstanceName);
    let pathname;
    if (typeof repoConfig === 'object') {
      const { baseURI, directory } = repoConfig;
      const basePath = `.cache/gatsby-source-git/${sourceInstanceName}`;
      const relativeFilePath = createFilePath({
        node,
        getNode,
        basePath,
      }).replace(directory, '');
      pathname = `/${baseURI}/${relativeFilePath}`.replace(multiSlashRE, '/');
    } else {
      pathname = createFilePath({
        node,
        getNode,
        basePath: 'src/content',
      });
    }

    // Add a field to each markdown node to indicate its source instance. This
    // is used by the gatsby-remark-prefix-relative-links plugin.
    createNodeField({
      node,
      name: 'sourceInstanceName',
      value: sourceInstanceName,
    });

    // Creates new query'able field with name of 'pathname'
    createNodeField({
      node,
      name: 'pathname',
      value: pathname,
    });
  }
};

exports.createPages = async ({ graphql, actions }) => {
  const { createPage } = actions;
  const result = await graphql(`
    query {
      allMarkdownRemark {
        edges {
          node {
            fields {
              pathname
              sourceInstanceName
            }
          }
        }
      }
    }
  `);
  result.data.allMarkdownRemark.edges.forEach(({ node }) => {
    createPage({
      path: node.fields.pathname,
      component: path.resolve(`./src/templates/docs-page.js`),
      context: {
        // Data passed to context is available
        // in page queries as GraphQL variables.
        pathname: node.fields.pathname,
        sourceInstanceName: node.fields.sourceInstanceName,
      },
    });
  });
};
