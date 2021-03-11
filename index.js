const chalk = require('chalk')
const htmlparser2 = require('htmlparser2')
const domutils = require('domutils')
const { isTag, isText, getAttributeValue, hasAttrib, getText, prevElementSibling, nextElementSibling, getChildren, getName, getParent } = domutils
const https = require('https')

// TODO: Proponerlo como método en domutils
function getChildrenElements (elem) {
  return getChildren(elem).filter((e) => isTag(e))
}

function parsePostContent (elem, hasChildrensAlready = false) {
  let content = ''

  if (!hasChildrensAlready) {
    // Obtenemos el elemento que como hijos tiene el contenido del post
    elem = domutils.filter((elem) => {
      return (
        hasAttrib(elem, 'id') &&
        getAttributeValue(elem, 'id').startsWith('post_message_')
      )
    }, elem)[0]
  }

  for (child of getChildren(elem)) {
    if (isText(child)) { // Si es texto, lo añadimos sin más
      content += getText(child).trim()
    } else if (isTag(child)) {
      if (getName(child) === 'img') { // Si es una imagen añadimos su enlace en forma markdown
        const imgUrl = getAttributeValue(child, 'src')
        const imgAlt = getAttributeValue(child, 'alt')
        if (imgAlt) {
          content += `![${imgAlt}](${imgUrl})`
        } else {
          content += `![](${imgUrl})`
        }
      } else if (getName(child) === 'div') { // Posiblemente sea una cita
        if (getText(getChildrenElements(child)[0]) !== 'Cita:') {
          console.log()
          console.log(chalk.red('Div extra en el post no soportado'))
          console.log(elem)
          console.log()
        } else {
          // <td> que contiene dos <div> donde el primero contiene quien escribió la cita y el segundo contiene la cita en si
          const quoteContentElement = getChildrenElements(getChildrenElements(getChildrenElements(child)[1])[0])[0]
          const quoteAuthor = getText(getChildrenElements(getChildrenElements(quoteContentElement)[0])[0])
          const quoteText = parsePostContent(getChildrenElements(quoteContentElement)[1], true)
          quoteText.split('\n').forEach(e => content += `\n> ${e}`)
          //content += `\n> ${quoteText}\n`
          content += `\n>\n> -- ${quoteAuthor}\n\n`
        }
      } else if (getName(child) === 'br') {
        content += '\n'
      } else if (getName(child) === 'a') {
        const url = getAttributeValue(child, 'href')
        const text = getText(child).trim()
        content += `[${text}](${url})`
      } else if (getName(child) === 'b') {
        content += `**${getText(child).trim()}**`
      } else {
        /*console.log()
        console.log(chalk.red('Elemento extra en el post no soportado'))
        console.log(elem)
        console.log()*/
      }
    }
  }

  return content
  // return getText(elem).trim()
}

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

async function getHomepagePosts () {
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

async function getThread (id) {
  const baseUrl = 'https://www.forocoches.com/foro/showthread.php?t='
  const url = baseUrl + id
  const reqText = await fetchUrl(url)
  const dom = htmlparser2.parseDocument(reqText)

  // Obtenemos el titulo del hilo/thread
  const titleQuery = domutils.filter((elem) => {
    return (
      getName(elem) === 'span' &&
      getAttributeValue(elem, 'class') === 'cmega'
    )
  }, dom, true)
  if (titleQuery.length <= 0) throw new Error('Problema al obtener el post')
  const title = getText(titleQuery[0]).trim()

  // Obtenemos las <table> donde cada table es un post
  const postQuery = domutils.filter((elem) => {
    return (
      hasAttrib(elem, 'id') &&
      getName(elem) === 'table' &&
      getAttributeValue(elem, 'id').startsWith('post')
    )
  }, dom)

  // Extraemos la información de cada <table>
  const posts = postQuery.map((elem) => {
    const post = { author: {} }

    // El id del post lo podemos encontrar en el propio elemento <table>
    post.postId = getAttributeValue(elem, 'id').replace('post', '')

    // Obtenemos los dos primeros <tr> de <table>, estos son los que contienen información del post
    // - 1º: Hora y número de post en el thread (el que tenga número 1 será el OP)
    // - 2º: Formado por dos <td> donde el primero tiene información del usuario y el segundo contiene lo que ha escrito
    const elemChildren = getChildrenElements(elem).slice(0, 2)

    post.time = getText(getChildrenElements(elemChildren[0])[0]).trim()
    post.number = parseInt(getText(getChildrenElements(elemChildren[0])[1]).trim().replace('#', ''))

    // Elementos contenidos en el <td> que contiene la información de usuario
    const authorElems = getChildrenElements(getChildrenElements(elemChildren[1])[0])

    const usernameAndIdElem = domutils.filter((e) => getAttributeValue(e, 'class') === 'bigusername' && getAttributeValue(e, 'href').startsWith('member.php?u='), authorElems)[0]
    post.author.username = getText(usernameAndIdElem).trim()
    post.author.id = parseInt(getAttributeValue(usernameAndIdElem, 'href').replace('member.php?u=', ''))

    // complicado
    post.content = parsePostContent(getChildrenElements(elemChildren[1])[1])

    return post
  })

  return { title, url, id, posts }
}

module.exports = { getHomepagePosts, getThread }
