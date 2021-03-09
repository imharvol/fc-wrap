const htmlparser2 = require('htmlparser2')
const domutils = require('domutils')
const { getAttributeValue, hasAttrib, getText, prevElementSibling, nextElementSibling, getChildren, getName, getParent } = domutils
const https = require('https')

function fetchUrl (url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      res.setEncoding('binary')

      let data = ''

      res.on('data', (d) => {
        data += d
      })

      res.on('end', () => {
        resolve(data)
      })
    }).on('error', (e) => {
      reject(e)
    })
  })
}

async function getGetHomepagePosts () {
  const baseUrl = 'https://www.forocoches.com'
  const reqText = await fetchUrl(baseUrl)
  const dom = htmlparser2.parseDocument(reqText)

  const query = domutils.filter(
    (elem) => {
      return (
        hasAttrib(elem, 'class') && hasAttrib(elem, 'href') && hasAttrib(elem, 'title') &&
        getName(elem) === 'a' &&
        getAttributeValue(elem, 'class') === 'texto' &&
        getAttributeValue(elem, 'href').startsWith('/foro/showthread.php?t=')
      )
    },
    dom,
    true
  )

  const posts = query.map((elem) => {
    const title = getAttributeValue(elem, 'title').trim()

    const id = parseInt(getAttributeValue(elem, 'href').replace('/foro/showthread.php?t=', ''))

    const link = baseUrl + getAttributeValue(elem, 'href')

    const authorElement = getChildren(nextElementSibling(getParent(elem)))[1]
    const author = {
      name: getText(authorElement).trim(),
      id: parseInt(getAttributeValue(authorElement, 'href').replace('/foro/member.php?u=', '')),
      link: baseUrl + getAttributeValue(authorElement, 'href')
    }

    const numResponses = parseInt(getText(nextElementSibling(nextElementSibling(getParent(elem)))).trim().replace('.', ''))

    const hour = getText(prevElementSibling(getParent(elem))).trim()

    const topicElement = prevElementSibling(elem)
    const topic = {
      name: getText(topicElement).trim(),
      id: parseInt(getAttributeValue(topicElement, 'href').replace('/foro/forumdisplay.php?f=', '')),
      link: baseUrl + getAttributeValue(topicElement, 'href')
    }

    return { id, title, link, author, topic, numResponses, hour }
  })

  return posts
}
